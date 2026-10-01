"""Real HTTP integration checks across five independent Python processes."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '.test-output'
ROLES = ['generator', 'channel', 'hub', 'processor', 'settlement']
FIELDS = {'transactionId', 'journeyId', 'channel', 'paymentType', 'paymentRail',
          'direction', 'customerSegment', 'amount', 'currency', 'scenario', 'service',
          'stage', 'status', 'durationMs', 'timestamp', 'stepSequence', 'errorCode', 'errorMessage'}


def request(port, path='/health', body=None, method='GET'):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def logs():
    return [json.loads(line) for role in ROLES
            for line in (OUTPUT / f'{role}.jsonl').read_text().splitlines() if line.strip()]


def check(result, stages):
    records = [r for r in logs() if r.get('transactionId') == result['transactionId']]
    assert len(records) == stages, records
    assert len({r['trace_id'] for r in records}) == 1, 'Trace context did not propagate'
    assert len({r['span_id'] for r in records}) >= stages - 1
    dimensions = FIELDS - {'service', 'stage', 'status', 'durationMs', 'timestamp', 'stepSequence', 'errorCode', 'errorMessage'}
    for record in records:
        assert FIELDS <= record.keys(), record
        assert all(record[key] == result[key] for key in dimensions), record
    finals = [r for r in records if r.get('eventType') == 'PAYMENT_COMPLETED']
    assert len(finals) == 1, finals
    assert finals[0]['status'] == result['status']
    return sorted(records, key=lambda r: r['stepSequence'])


def main():
    OUTPUT.mkdir(exist_ok=True)
    # Reserve distinct ephemeral ports before launching children.
    sockets = [socket.socket() for _ in ROLES]
    for sock in sockets:
        sock.bind(('127.0.0.1', 0))
    ports = [sock.getsockname()[1] for sock in sockets]
    for sock in sockets:
        sock.close()
    processes, handles = [], []
    try:
        for index, role in reversed(list(enumerate(ROLES))):
            env = {k: v for k, v in os.environ.items() if not k.startswith('OTEL_')}
            env.update(SERVICE=role, PORT=str(ports[index]), TRANSACTIONS_PER_MINUTE='0',
                       PYTHONUNBUFFERED='1', PAYMENT_TYPE_WEIGHTS='40,25,25,10', SCENARIO_WEIGHTS='95,3,2')
            if index < 4:
                env['NEXT_SERVICE_URL'] = f'http://127.0.0.1:{ports[index + 1]}'
            handle = (OUTPUT / f'{role}.jsonl').open('w')
            handles.append(handle)
            processes.append(subprocess.Popen([sys.executable, 'run.py'], cwd=ROOT, env=env,
                                              stdout=handle, stderr=handle,
                                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0))
        for port in ports:
            deadline = time.monotonic() + 30
            while True:
                try:
                    assert request(port) == {'status': 'UP'}
                    break
                except (OSError, AssertionError):
                    if time.monotonic() > deadline:
                        raise RuntimeError(f'Service on {port} did not start; inspect {OUTPUT}')
                    time.sleep(0.1)

        sample = None
        for kind, rail in [('PAYID', 'NPP'), ('BPAY', 'BPAY'), ('ACCOUNT_TRANSFER', 'INTERNAL'), ('INTERNATIONAL_TRANSFER', 'SWIFT')]:
            result = request(ports[0], '/generate', {'paymentType': kind, 'scenario': 'NORMAL'}, 'POST')
            assert result['status'] == 'SUCCESS' and result['paymentRail'] == rail
            records = check(result, 6)
            sample = sample or records
        result = request(ports[0], '/generate', {'paymentType': 'PAYID', 'scenario': 'SLOW_SETTLEMENT'}, 'POST')
        assert result['status'] == 'SUCCESS' and result['totalDurationMs'] >= 3000
        assert next(r for r in check(result, 6) if r['stage'] == 'SETTLEMENT_COMPLETED')['durationMs'] >= 3000
        result = request(ports[0], '/generate', {'paymentType': 'INTERNATIONAL_TRANSFER', 'scenario': 'FAILED_PAYMENT'}, 'POST')
        assert result['status'] == 'FAILED'
        check(result, 5 if result['errorCode'] == 'FRAUD_BLOCK' else 6)

        # Pin both failure locations using the internal service envelope.
        for where in ['processor', 'settlement']:
            payment = {k: sample[0][k] for k in ['transactionId', 'journeyId', 'channel', 'paymentType', 'paymentRail',
                                              'direction', 'customerSegment', 'amount', 'currency', 'scenario']}
            payment.update(transactionId=f'PAY-{uuid4().hex}', scenario='FAILED_PAYMENT',
                           startedAt=time.time(), failureAt=where)
            result = request(ports[1], '/payments', payment, 'POST')
            assert result['errorCode'] == ('FRAUD_BLOCK' if where == 'processor' else 'NPP_TIMEOUT')
            records = check(result, 4 if where == 'processor' else 5)
            if where == 'processor':
                assert not any(r['stage'].startswith('SETTLEMENT') for r in records)

        assert request(ports[0], '/generate', method='POST')['eventType'] == 'PAYMENT_COMPLETED'
        for invalid in [{'paymentType': 'CARD'}, {'scenario': 'INVALID'}, {'unexpected': True}]:
            try:
                request(ports[0], '/generate', invalid, 'POST')
                raise AssertionError('Invalid input accepted')
            except urllib.error.HTTPError as error:
                assert error.code == 422

        # Restart only the generator with fast continuous slow-payment traffic.
        # Three starts within two seconds proves settlement doesn't block the timer.
        processes[-1].terminate()
        processes[-1].wait(timeout=10)
        previous_ids = {r.get('transactionId') for r in logs()}
        env.update(TRANSACTIONS_PER_MINUTE='120', SCENARIO_WEIGHTS='0,1,0')
        processes.append(subprocess.Popen([sys.executable, 'run.py'], cwd=ROOT, env=env,
                                          stdout=handles[-1], stderr=handles[-1],
                                          creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0))
        deadline = time.monotonic() + 15
        while True:
            generated = [r for r in logs() if r.get('stage') == 'PAYMENT_GENERATED'
                         and r['transactionId'] not in previous_ids]
            if len(generated) >= 3:
                break
            assert time.monotonic() < deadline, 'Automatic traffic did not continue'
            time.sleep(0.1)
        from datetime import datetime
        elapsed = (datetime.fromisoformat(generated[2]['timestamp']) - datetime.fromisoformat(generated[0]['timestamp'])).total_seconds()
        assert 0.8 <= elapsed < 2, elapsed
        assert all(r['scenario'] == 'SLOW_SETTLEMENT' for r in generated)
        processes[-1].terminate()
        processes[-1].wait(timeout=10)

        # A transport outage must not masquerade as a completed business failure.
        processes[0].terminate()  # settlement was launched first
        processes[0].wait(timeout=10)
        payment.update(transactionId=f'PAY-{uuid4().hex}', scenario='NORMAL', startedAt=time.time())
        try:
            request(ports[1], '/payments', payment, 'POST')
            raise AssertionError('Downstream outage accepted')
        except urllib.error.HTTPError as error:
            assert error.code == 502
        outage = [r for r in logs() if r.get('transactionId') == payment['transactionId']]
        assert any(r['stage'] == 'DELIVERY_ERROR' for r in outage)
        assert not any(r.get('eventType') == 'PAYMENT_COMPLETED' for r in outage)

        (OUTPUT / 'sample-logs.jsonl').write_text('\n'.join(json.dumps(r, separators=(',', ':')) for r in sample) + '\n')
        print(f'PASS: five live services; four rails; three scenarios; both failure locations; JSON schema; one completion; trace propagation; input validation; continuous traffic during slow settlement; downstream outage. Sample: {sample[0]["transactionId"]}')
    finally:
        for process in processes:
            process.terminate()
        for process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for handle in handles:
            handle.close()


if __name__ == '__main__':
    main()

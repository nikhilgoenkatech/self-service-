import asyncio
import math
import os
import random
import time
from uuid import uuid4
from fastapi import HTTPException
from opentelemetry import trace
from common.model import FLOWS, GenerateRequest, Payment
from common.logging import emit, event
from common.runtime import create_app, forward


def weights(name, defaults):
    values = [float(v) for v in os.getenv(name, defaults).split(',')]
    if len(values) != len(defaults.split(',')) or any(not math.isfinite(v) or v < 0 for v in values) or sum(values) <= 0:
        raise ValueError(f'{name} must contain nonnegative finite weights with a positive total')
    return values


FLOW_WEIGHTS = weights('PAYMENT_TYPE_WEIGHTS', '40,25,25,10')
SCENARIO_WEIGHTS = weights('SCENARIO_WEIGHTS', '95,3,2')
RATE = float(os.getenv('TRANSACTIONS_PER_MINUTE', '10'))
if not math.isfinite(RATE) or not 0 <= RATE <= 600:
    raise ValueError('TRANSACTIONS_PER_MINUTE must be between 0 and 600')


def make_payment(request):
    kind = request.paymentType or random.choices(list(FLOWS), FLOW_WEIGHTS)[0]
    scenario = request.scenario or random.choices(['NORMAL', 'SLOW_SETTLEMENT', 'FAILED_PAYMENT'], SCENARIO_WEIGHTS)[0]
    rail, channels = FLOWS[kind]
    channel = random.choice(channels)
    segment = 'CORPORATE' if channel == 'CORPORATE_API' else random.choices(
        ['RETAIL', 'SMALL_BUSINESS', 'CORPORATE'], [80, 17, 3])[0]
    low, high = {'RETAIL': (10, 5000), 'SMALL_BUSINESS': (100, 25000), 'CORPORATE': (1000, 500000)}[segment]
    amount = round(low + (high - low) * random.betavariate(1.2, 5), 2)
    return Payment(transactionId=f'PAY-{uuid4().hex}', journeyId=f'JRN-{uuid4().hex}',
                   channel=channel, paymentType=kind, paymentRail=rail, customerSegment=segment,
                   amount=amount, scenario=scenario, startedAt=time.time(),
                   failureAt=random.choice(['processor', 'settlement']))


async def generate(request):
    with trace.get_tracer(__name__).start_as_current_span('generate-payment'):
        payment = make_payment(request)
        event(payment, 'Payment Generator', 'PAYMENT_GENERATED', 0, 0, 'PROCESSING')
        return await forward(app, payment, 'payment-channel', 'Payment Generator', 0)


async def traffic(app):
    if RATE == 0:
        return
    pending = set()

    async def send():
        try:
            await generate(GenerateRequest())
        except HTTPException:
            pass  # forward already logged the affected business identifiers.
        except Exception as exc:
            emit({'service': 'Payment Generator', 'level': 'ERROR', 'message': type(exc).__name__})

    try:
        while True:
            # Independent requests keep the rate steady during slow settlement.
            if len(pending) < 100:
                task = asyncio.create_task(send())
                pending.add(task)
                task.add_done_callback(pending.discard)
            else:
                emit({'service': 'Payment Generator', 'level': 'WARNING', 'message': 'In-flight limit reached; skipping automatic payment'})
            await asyncio.sleep(60 / RATE)
    finally:
        await asyncio.gather(*pending, return_exceptions=True)


app = create_app('payment-generator', traffic)


@app.post('/generate')
async def manual_generate(request: GenerateRequest | None = None):
    return await generate(request or GenerateRequest())

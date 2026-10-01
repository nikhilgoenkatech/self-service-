import json
import logging
import time
from datetime import datetime, timezone
from opentelemetry import trace


def emit(record):
    record = {'timestamp': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'), **record}
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        record.update(trace_id=f'{context.trace_id:032x}', span_id=f'{context.span_id:016x}')
    print(json.dumps(record, separators=(',', ':'), allow_nan=False), flush=True)
    return record


class JsonHandler(logging.Handler):
    def emit(self, record):
        emit({'level': record.levelname, 'logger': record.name, 'message': record.getMessage()})


def configure_logging():
    logging.basicConfig(handlers=[JsonHandler()], level=logging.INFO, force=True)
    for name in ('uvicorn', 'uvicorn.error', 'uvicorn.access'):
        logger = logging.getLogger(name)
        logger.handlers = []
        logger.propagate = True
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('uvicorn.access').disabled = True


def event(payment, service, stage, sequence, duration, status='SUCCESS', **extra):
    return emit({**payment.dimensions(), 'service': service, 'stage': stage,
                 'stepSequence': sequence, 'status': status, 'durationMs': round(duration, 2),
                 'errorCode': None, 'errorMessage': None, **extra})


def complete(payment, service, sequence, status='SUCCESS', **extra):
    duration = max(0, (time.time() - payment.startedAt) * 1000)
    return event(payment, service, 'PAYMENT_COMPLETED', sequence, duration, status,
                 eventType='PAYMENT_COMPLETED', totalDurationMs=round(duration, 2), **extra)

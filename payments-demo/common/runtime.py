import asyncio
import os
import random
import time
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException
from opentelemetry import trace
from common.logging import configure_logging, event
from common.telemetry import instrument


def create_app(service, background=None):
    configure_logging()

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=20, trust_env=False) as client:
            app.state.client = client
            task = asyncio.create_task(background(app)) if background else None
            try:
                yield
            finally:
                if task:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                provider.shutdown()

    app = FastAPI(title=service, lifespan=lifespan)
    provider = instrument(app, service)

    @app.get('/health')
    async def health():
        return {'status': 'UP'}

    return app


async def latency(low, high):
    start = time.perf_counter()
    await asyncio.sleep(random.uniform(low, high) / 1000)
    return (time.perf_counter() - start) * 1000


async def forward(app, payment, destination, service, sequence):
    for key in ('transactionId', 'paymentType', 'paymentRail', 'channel'):
        trace.get_current_span().set_attribute(key, getattr(payment, key))
    url = os.getenv('NEXT_SERVICE_URL', f'http://{destination}:8080')
    try:
        response = await app.state.client.post(f'{url.rstrip("/")}/payments', json=payment.model_dump())
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        # A lost response has an unknown outcome; don't invent a second completion.
        event(payment, service, 'DELIVERY_ERROR', sequence, 0, 'UNKNOWN',
              errorCode='DOWNSTREAM_UNAVAILABLE', errorMessage=type(exc).__name__)
        raise HTTPException(502, 'Downstream delivery failed; outcome may be unknown') from exc

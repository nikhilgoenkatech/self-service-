from common.model import Payment
from common.logging import event
from common.runtime import create_app, forward, latency

app = create_app('payment-hub')


@app.post('/payments')
async def process(payment: Payment):
    duration = await latency(20, 150)
    event(payment, 'Payment Hub', 'PAYMENT_ROUTED', 2, duration)
    return await forward(app, payment, 'payment-processor', 'Payment Hub', 2)

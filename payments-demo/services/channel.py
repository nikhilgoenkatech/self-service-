from common.model import Payment
from common.logging import event
from common.runtime import create_app, forward, latency

app = create_app('payment-channel')
CHANNELS = {'ANZ_PLUS': 'ANZ Plus', 'MOBILE_BANKING': 'Mobile Banking',
            'INTERNET_BANKING': 'Internet Banking', 'CORPORATE_API': 'Corporate API'}


@app.post('/payments')
async def process(payment: Payment):
    service = CHANNELS[payment.channel]
    duration = await latency(20, 120)
    event(payment, service, 'PAYMENT_INITIATED', 1, duration)
    return await forward(app, payment, 'payment-hub', service, 1)

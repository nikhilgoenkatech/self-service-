import random
from common.model import Payment
from common.logging import complete, event
from common.runtime import create_app, forward, latency

app = create_app('payment-processor')


@app.post('/payments')
async def process(payment: Payment):
    duration = await latency(50, 400)
    failed = payment.scenario == 'FAILED_PAYMENT' and payment.failureAt == 'processor'
    risk = random.randint(85, 99) if failed else random.randint(1, 70)
    decision = 'BLOCK' if failed else ('REVIEW' if risk >= 60 else 'ALLOW')
    details = {'riskScore': risk, 'fraudDecision': decision}
    if failed:
        details.update(errorCode='FRAUD_BLOCK', errorMessage='Synthetic fraud screening block')
    event(payment, 'Payment Processor', 'PAYMENT_PROCESSING', 3, duration,
          'FAILED' if failed else 'SUCCESS', **details)
    if failed:
        return complete(payment, 'Payment Processor', 4, 'FAILED', **details)
    # REVIEW is a simulated review completed within this processing stage.
    return await forward(app, payment, 'payment-settlement', 'Payment Processor', 3)

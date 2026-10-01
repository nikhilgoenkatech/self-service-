from common.model import Payment
from common.logging import complete, event
from common.runtime import create_app, latency

app = create_app('payment-settlement')
SERVICES = {'NPP': 'NPP Settlement', 'BPAY': 'BPAY Settlement',
            'SWIFT': 'SWIFT Gateway', 'INTERNAL': 'Internal Ledger'}
ERRORS = {'NPP': 'NPP_TIMEOUT', 'BPAY': 'BPAY_REJECTED',
          'SWIFT': 'SWIFT_REJECTED', 'INTERNAL': 'INTERNAL_REJECTED'}


@app.post('/payments')
async def process(payment: Payment):
    duration = await latency(3000, 8000) if payment.scenario == 'SLOW_SETTLEMENT' else await latency(80, 300)
    failed = payment.scenario == 'FAILED_PAYMENT'
    service = SERVICES[payment.paymentRail]
    details = {'errorCode': ERRORS[payment.paymentRail],
               'errorMessage': 'Synthetic settlement failure'} if failed else {}
    status = 'FAILED' if failed else 'SUCCESS'
    event(payment, service, 'SETTLEMENT_FAILED' if failed else 'SETTLEMENT_COMPLETED',
          4, duration, status, **details)
    return complete(payment, service, 5, status, **details)

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

PaymentType = Literal['PAYID', 'BPAY', 'ACCOUNT_TRANSFER', 'INTERNATIONAL_TRANSFER']
Scenario = Literal['NORMAL', 'SLOW_SETTLEMENT', 'FAILED_PAYMENT']
FLOWS = {
    'PAYID': ('NPP', ['ANZ_PLUS', 'MOBILE_BANKING']),
    'BPAY': ('BPAY', ['MOBILE_BANKING', 'INTERNET_BANKING']),
    'ACCOUNT_TRANSFER': ('INTERNAL', ['ANZ_PLUS', 'INTERNET_BANKING']),
    'INTERNATIONAL_TRANSFER': ('SWIFT', ['INTERNET_BANKING', 'CORPORATE_API']),
}


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    paymentType: PaymentType | None = None
    scenario: Scenario | None = None


class Payment(BaseModel):
    model_config = ConfigDict(extra='forbid')
    transactionId: str = Field(pattern=r'^PAY-[A-Za-z0-9-]+$', max_length=80)
    journeyId: str = Field(pattern=r'^JRN-[A-Za-z0-9-]+$', max_length=80)
    channel: Literal['ANZ_PLUS', 'MOBILE_BANKING', 'INTERNET_BANKING', 'CORPORATE_API']
    direction: Literal['OUTBOUND'] = 'OUTBOUND'
    paymentType: PaymentType
    paymentRail: Literal['NPP', 'BPAY', 'SWIFT', 'INTERNAL']
    customerSegment: Literal['RETAIL', 'SMALL_BUSINESS', 'CORPORATE']
    amount: float = Field(gt=0, le=500000, allow_inf_nan=False)
    currency: Literal['AUD'] = 'AUD'
    status: Literal['PROCESSING'] = 'PROCESSING'
    scenario: Scenario = 'NORMAL'
    # Internal envelope fields; excluded from the shared business dimensions.
    startedAt: float = Field(gt=0)
    failureAt: Literal['processor', 'settlement'] = 'processor'

    @model_validator(mode='after')
    def valid_flow(self):
        rail, channels = FLOWS[self.paymentType]
        if self.paymentRail != rail or self.channel not in channels:
            raise ValueError('Invalid payment type, rail, or channel combination')
        return self

    def dimensions(self):
        return self.model_dump(exclude={'startedAt', 'failureAt', 'status'})

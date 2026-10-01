import os
import uvicorn
from common.logging import configure_logging

if __name__ == '__main__':
    configure_logging()
    service = os.getenv('SERVICE', 'generator')
    if service not in {'generator', 'channel', 'hub', 'processor', 'settlement'}:
        raise ValueError('Unknown SERVICE')
    uvicorn.run(f'services.{service}:app', host='0.0.0.0', port=int(os.getenv('PORT', '8080')),
                log_config=None, access_log=False)

import os
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor


def instrument(app, service):
    provider = TracerProvider(resource=Resource.create({'service.name': service}))
    trace.set_tracer_provider(provider)
    # Local runs still create/propagate trace IDs without requiring a collector.
    if os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT') or os.getenv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT'):
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    HTTPXClientInstrumentor().instrument()
    FastAPIInstrumentor.instrument_app(app, excluded_urls='/health')
    return provider

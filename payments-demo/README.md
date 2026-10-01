# Synthetic payments demo

Five independent FastAPI services reconstruct a synthetic payment by business ID and by distributed trace. No database, broker, authentication, PII, or real payment processing. This folder runs independently of the parent Dynatrace AppEngine UI.

```text
payment-generator -> payment-channel -> payment-hub -> payment-processor -> payment-settlement
```

One shared image keeps builds small; `SERVICE` selects the process. There are exactly five Deployments. Settlement changes its logical log `service` by rail; it remains one physical application. The supplied reference repository could not be retrieved, so this is a standalone implementation using familiar HTTP service, environment configuration, and OpenTelemetry conventions, with no e-commerce code copied.

## Run locally

Install Docker with Compose, then from this folder:

```sh
docker compose up --build
```

Generator: <http://localhost:8080>. Automatic traffic starts at 10 payments/minute. All five services expose `/health` returning `{"status":"UP"}`. Only the generator is published to the host. View logs with `docker compose logs -f --no-log-prefix`; use `docker compose down` to stop.

## Run on Kubernetes

The image must first be available on cluster nodes; no unpublished registry image is assumed. For a local **kind** cluster:

```sh
docker build -t payments-demo:local .
kind load docker-image payments-demo:local
kubectl apply -f k8s/
kubectl wait --for=condition=available deployment -l app.kubernetes.io/part-of=payments-demo --timeout=120s
kubectl port-forward svc/payment-generator 8080:8080
```

For **minikube**, replace the kind load command with `minikube image load payments-demo:local`. For a remote cluster, tag and push the image to your registry, replace all five `image: payments-demo:local` values in `k8s/payments-demo.yaml`, then apply. Use a new image tag for subsequent builds. Manifests use your current namespace; add `-n YOUR_NAMESPACE` consistently if needed.

Total requested resources: 125m CPU and 320Mi memory; total limits: 1.25 CPU and 960Mi. There is no ingress or collector bundled. Remove with `kubectl delete -f k8s/`.

## Live demo endpoints

Each call waits for completion and returns the terminal event, including its transaction ID. Slow settlement takes 3–8 seconds plus the other stages. On Windows PowerShell use `curl.exe` or `Invoke-RestMethod`.

```sh
curl -X POST http://localhost:8080/generate
curl -X POST http://localhost:8080/generate -H 'Content-Type: application/json' -d '{"paymentType":"PAYID"}'
curl -X POST http://localhost:8080/generate -H 'Content-Type: application/json' -d '{"paymentType":"PAYID","scenario":"SLOW_SETTLEMENT"}'
curl -X POST http://localhost:8080/generate -H 'Content-Type: application/json' -d '{"paymentType":"INTERNATIONAL_TRANSFER","scenario":"FAILED_PAYMENT"}'
```

```powershell
Invoke-RestMethod http://localhost:8080/generate -Method Post -ContentType 'application/json' -Body '{"paymentType":"PAYID","scenario":"SLOW_SETTLEMENT"}'
```

Optional body fields are `paymentType` and `scenario`; unknown values or fields return HTTP 422. A synthetic business failure returns HTTP 200 with `status: FAILED` so business failures can be distinguished from transport errors.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `TRANSACTIONS_PER_MINUTE` | `10` | Continuous automatic rate, 0 disables; range 0–600 |
| `PAYMENT_TYPE_WEIGHTS` | `40,25,25,10` | PAYID, BPAY, ACCOUNT_TRANSFER, INTERNATIONAL_TRANSFER |
| `SCENARIO_WEIGHTS` | `95,3,2` | NORMAL, SLOW_SETTLEMENT, FAILED_PAYMENT |
| `NEXT_SERVICE_URL` | next Kubernetes service | Downstream HTTP base URL |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | Optional OTLP HTTP collector base URL, e.g. `http://otel-collector:4318` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | unset | Optional full trace endpoint, including `/v1/traces` |
| `OTEL_EXPORTER_OTLP_HEADERS` | unset | Standard exporter headers if your collector requires them |
| `SERVICE` | `generator` | generator, channel, hub, processor, settlement |
| `PORT` | `8080` | Listener port |

Weights are relative, finite, nonnegative numbers with a positive total. Set variables in your shell or a Compose `.env` file; Kubernetes values are in the ConfigMap. After changing the ConfigMap, apply and run `kubectl rollout restart deployment -l app.kubernetes.io/part-of=payments-demo`. Keep collector credentials in Kubernetes Secrets if needed. The Compose file forwards the base OTLP endpoint and headers; add a traces-specific endpoint to its shared environment if using one.

| Payment type | Rail | Allowed channels | Settlement log service |
| --- | --- | --- | --- |
| PAYID | NPP | ANZ_PLUS, MOBILE_BANKING | NPP Settlement |
| BPAY | BPAY | MOBILE_BANKING, INTERNET_BANKING | BPAY Settlement |
| ACCOUNT_TRANSFER | INTERNAL | ANZ_PLUS, INTERNET_BANKING | Internal Ledger |
| INTERNATIONAL_TRANSFER | SWIFT | INTERNET_BANKING, CORPORATE_API | SWIFT Gateway |

Amounts follow a lower-value-skewed beta distribution within AUD 10–5,000 (retail), 100–25,000 (small business), or 1,000–500,000 (corporate). Corporate API payments use the corporate segment; other channels use 80/17/3 segment weighting. IDs use `PAY-`/`JRN-` plus UUIDs to avoid collisions across restarts and replicas. All payments are outbound AUD for simplicity.

Normal delays are 20–120ms channel, 20–150ms hub, 50–400ms processor, and 80–300ms settlement. SLOW_SETTLEMENT changes only the last delay to 3–8 seconds. FAILED_PAYMENT randomly chooses processor or settlement with equal probability. Processor BLOCK terminates the flow with FRAUD_BLOCK; REVIEW represents a simulated review completed in the same service. Settlement errors are rail-specific. There are only three scenarios.

## Logs and traces

All application and runtime log records are one-line JSON to stdout. Business stage records carry the shared dimensions plus stage, logical service, status, stepSequence, durationMs, timestamp, errorCode, and errorMessage. Startup/health infrastructure records are not payment records. Stage `SUCCESS` means that stage succeeded; only `PAYMENT_COMPLETED` expresses the overall outcome. The generator logs sequence 0, followed by stages 1–4 and completion at 5 (or completion at 4 after processor failure).

The terminating service alone emits `eventType: PAYMENT_COMPLETED`. **Count only these events for payment totals, failure rate, value, and end-to-end P95**, otherwise stage logs multiply the counts. `durationMs` measures the local simulated stage; `totalDurationMs` measures wall-clock time since generation, including HTTP transit. Cluster clocks must be synchronized.

An HTTP delivery error is logged as `DELIVERY_ERROR`, status UNKNOWN, and returns HTTP 502. No automatic retries or duplicate completion events are generated: a lost response could mean the downstream service already completed. Exactly-once delivery across crashes/replays is intentionally outside this in-memory demo. Transport errors are separate from the three synthetic business scenarios. Automatic traffic continues after failed requests, with a cap of 100 in-flight automatic payments.

FastAPI and HTTPX instrumentation create server/client spans and propagate W3C trace context. Every business record includes `trace_id` and `span_id` when available. Physical span `service.name` stays stable (e.g. payment-settlement); logical log `service` can be NPP Settlement or SWIFT Gateway. With no exporter endpoint configured, trace IDs still propagate but spans are not exported. Configure an existing OTLP HTTP collector to forward traces to your backend; no Dynatrace API client is included. Container stdout log ingestion must be enabled separately in your Dynatrace Kubernetes monitoring setup. `PAYMENT_COMPLETED` is a JSON log event, not an automatically ingested Grail business event.

Instrumentation follows the official [FastAPI](https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/fastapi/fastapi.html) and [HTTPX](https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/httpx/httpx.html) examples.

## Eight-step Dynatrace demonstration

1. Deploy using the Kubernetes commands above and enable container log collection.
2. Allow automatic traffic to run for a few minutes.
3. Search logs for `transactionId` or `PAY-` and select one ID.
4. Run the journey query below with that ID (the conceptual `PAY-100001` example is replaced with your generated UUID). For a PayID originating from ANZ_PLUS, show **ANZ Plus → Payment Hub → Payment Processor → NPP Settlement** with the same business ID; MOBILE_BANKING appears as Mobile Banking. Compare this grouping with the common `trace_id`.
5. Run the grouped query to split final transactions by paymentRail, paymentType, channel, and status.
6. Run the summary query to show payment count, failure count/rate, P95 duration, and total attempted transaction value. The value includes failed payments; filter status to SUCCESS for completed value.
7. Manually trigger PAYID + SLOW_SETTLEMENT with the curl example. Copy the returned ID, reconstruct its journey, and highlight the settlement stage duration.
8. Trigger INTERNATIONAL_TRANSFER + FAILED_PAYMENT. Show the returned failure code and the final service; a processor failure has no settlement stage.

These queries parse raw JSON `content` so they do not require a custom ingestion pipeline. If your collector wraps application JSON in another field, adjust the parse input. Run in a short time range and optionally add your namespace filter. Queries follow the official [JSON parsing examples](https://docs.dynatrace.com/docs/platform/grail/dynatrace-query-language/dql-use-cases) and [aggregation reference](https://docs.dynatrace.com/docs/discover-dynatrace/references/dynatrace-query-language/commands/aggregation-commands); they have not been executed against a tenant here.

Journey:

```dql
fetch logs
| parse content, "JSON:p"
| filter p[transactionId] == "PAY-REPLACE-WITH-RETURNED-ID"
| fields timestamp, transactionId = p[transactionId], service = p[service], stage = p[stage], status = p[status], stepSequence = p[stepSequence], durationMs = p[durationMs], errorCode = p[errorCode], trace_id = p[trace_id]
| sort stepSequence asc
```

Grouping:

```dql
fetch logs
| parse content, "JSON:p"
| filter p[eventType] == "PAYMENT_COMPLETED"
| summarize payments = count(), by:{paymentRail = p[paymentRail], paymentType = p[paymentType], channel = p[channel], status = p[status]}
```

Summary:

```dql
fetch logs
| parse content, "JSON:p"
| filter p[eventType] == "PAYMENT_COMPLETED"
| summarize paymentCount = count(), failureCount = countIf(p[status] == "FAILED"), p95DurationMs = percentile(toDouble(p[totalDurationMs]), 95), totalTransactionValueAUD = sum(toDouble(p[amount]))
| fieldsAdd failureRatePercent = 100.0 * failureCount / paymentCount
```

## Verify without containers

Use Python 3.12+ in a virtual environment:

```sh
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python tests/smoke.py
```

The smoke test starts all five processes on local ephemeral ports and makes real HTTP requests. It checks four journeys, all scenarios, both failure locations, matching business dimensions and trace IDs, a single final event, slow settlement duration, health, invalid input, continuous generation during slow settlement, and downstream outage handling. It stops its processes on exit and writes `.test-output/sample-logs.jsonl` and per-service logs. `examples/sample-logs.jsonl` contains a captured successful journey from local verification. Docker/Kubernetes and live Dynatrace export require their respective runtimes and environment.

Local verification passed with Python 3.12.10: all smoke checks, dependency consistency (`pip check`), and Python compilation. Both YAML files were parsed and checked for five services; the Kubernetes manifest contains five Deployments and five Services. Docker image builds, cluster deployment, OTLP export to a collector, and tenant DQL execution were not verified in this workspace.

// ID of the TOKEN credential stored in Dynatrace Credential Vault.
// The credential must have scope APP_ENGINE so the app function can read it.
export const VAULT_CREDENTIAL_ID = "CREDENTIALS_VAULT-511FC1F27BC482FA";

export type FieldType = "boolean" | "number" | "string";

export interface FieldDef {
  /** Dot-notation path into the settings value object, e.g. "detection.enabled" */
  key: string;
  label: string;
  type: FieldType;
}

export interface TabDef {
  id: string;
  label: string;
  schemaId: string;
  /** DT entity type selector string, e.g. "HOST" */
  entityType: string;
  fields: FieldDef[];
}

// ─── Add new settings tabs here ──────────────────────────────────────────────
export const TABS: TabDef[] = [
  {
    id: "anomaly-detection",
    label: "Anomaly Detection",
    schemaId: "builtin:anomaly-detection.infrastructure-hosts",
    entityType: "HOST",
    fields: [
      {
        key: "highCpuSaturationDetection.enabled",
        label: "CPU Saturation",
        type: "boolean",
      },
      {
        key: "highMemoryDetection.enabled",
        label: "Memory Detection",
        type: "boolean",
      },
      {
        key: "highGcActivityDetection.enabled",
        label: "GC Activity",
        type: "boolean",
      },
      {
        key: "outOfMemoryDetection.enabled",
        label: "OOM Detection",
        type: "boolean",
      },
      {
        key: "networkDroppedPacketsDetection.enabled",
        label: "Dropped Packets",
        type: "boolean",
      },
    ],
  },
  {
    id: "log-monitoring",
    label: "Log Monitoring",
    schemaId: "builtin:logmonitoring.log-storage-settings",
    entityType: "HOST",
    fields: [
      { key: "enabled", label: "Enabled", type: "boolean" },
      {
        key: "sendingOfNonJsonLogs",
        label: "Send Non-JSON Logs",
        type: "boolean",
      },
    ],
  },
];

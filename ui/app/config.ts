export const VAULT_CREDENTIAL_ID = "CREDENTIALS_VAULT-511FC1F27BC482FA";

export type FieldType = "boolean" | "number" | "string" | "detection";

export interface ThresholdDef {
  key: string;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  defaultValue: number;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  thresholds?: ThresholdDef[];
  // Schema-valid defaults to inject when customThresholds.eventThresholds is null/absent.
  // Only specify this for fields where DT requires eventThresholds but stores it as null.
  // Each field type has a different eventThresholds schema — never inject fields not in the schema.
  eventThresholdsDefaults?: Record<string, unknown>;
}

export interface TabDef {
  id: string;
  label: string;
  schemaId: string;
  schemaVersion: string;
  entityType: string;
  fields: FieldDef[];
}

export const TABS: TabDef[] = [
  {
    id: "infrastructure-anomaly",
    label: "Infrastructure Anomaly Settings",
    schemaId: "builtin:anomaly-detection.infrastructure-hosts",
    schemaVersion: "1.3",
    entityType: "HOST",
    fields: [
      {
        key: "host.highCpuSaturationDetection",
        label: "CPU Saturation",
        type: "detection",
        thresholds: [
          { key: "cpuSaturation", label: "CPU threshold", unit: "%", min: 1, max: 100, defaultValue: 95 },
        ],
        eventThresholdsDefaults: {
          dealertingEvaluationWindow: 5,
          dealertingSamples: 5,
          violatingSamples: 3,
          violatingEvaluationWindow: 5,
        },
      },
      {
        key: "host.highMemoryDetection",
        label: "Memory Usage",
        type: "detection",
        thresholds: [
          { key: "usedMemoryPercentageNonWindows", label: "Memory % (Linux)", unit: "%", min: 1, max: 100, defaultValue: 95 },
          { key: "usedMemoryPercentageWindows", label: "Memory % (Windows)", unit: "%", min: 1, max: 100, defaultValue: 95 },
          { key: "pageFaultsPerSecondNonWindows", label: "Page faults/s (Linux)", min: 0, max: 50000, defaultValue: 1000 },
          { key: "pageFaultsPerSecondWindows", label: "Page faults/s (Windows)", min: 0, max: 50000, defaultValue: 1500 },
        ],
        eventThresholdsDefaults: {
          dealertingEvaluationWindow: 5,
          dealertingSamples: 5,
          violatingSamples: 3,
          violatingEvaluationWindow: 5,
        },
      },
      {
        key: "host.highGcActivityDetection",
        label: "GC Activity",
        type: "detection",
        thresholds: [
          { key: "gcTimePercentage", label: "GC time", unit: "%", min: 0, max: 100, defaultValue: 50 },
          { key: "gcSuspensionPercentage", label: "GC suspension", unit: "%", min: 1, max: 100, defaultValue: 1 },
        ],
        // DT requires eventThresholds for GC but stores it as null when not configured.
        // GC uses the same 4-field EventThresholds schema as CPU — alertingOnMissingData
        // and samples are NOT valid fields here (DT returns "Unknown property" for them).
        eventThresholdsDefaults: {
          dealertingEvaluationWindow: 5,
          dealertingSamples: 5,
          violatingSamples: 3,
          violatingEvaluationWindow: 5,
        },
      },
      {
        key: "network.highNetworkDetection",
        label: "Network Utilization",
        type: "detection",
        thresholds: [
          { key: "errorsPercentage", label: "Errors", unit: "%", min: 0, max: 100, defaultValue: 50 },
        ],
        eventThresholdsDefaults: {
          dealertingEvaluationWindow: 5,
          dealertingSamples: 5,
          violatingSamples: 3,
          violatingEvaluationWindow: 5,
        },
      },
      {
        key: "network.networkDroppedPacketsDetection",
        label: "Dropped Packets",
        type: "detection",
        thresholds: [
          { key: "droppedPacketsPercentage", label: "Dropped packet %", unit: "%", min: 0, max: 100, defaultValue: 10 },
          { key: "totalPacketsRate", label: "Total packets rate", unit: "packets/s", min: 0, max: 100000, defaultValue: 10 },
        ],
        eventThresholdsDefaults: {
          dealertingEvaluationWindow: 5,
          dealertingSamples: 5,
          violatingSamples: 3,
          violatingEvaluationWindow: 5,
        },
      },
    ],
  },
  {
    id: "disk-anomaly",
    label: "Disk Anomaly Settings",
    schemaId: "builtin:anomaly-detection.infrastructure-disks",
    schemaVersion: "3",
    entityType: "HOST",
    fields: [
      {
        key: "disk.diskLowSpaceDetection",
        label: "Low Disk Space",
        type: "detection",
        thresholds: [
          { key: "freeSpacePercentage", label: "Free space", unit: "%", min: 1, max: 99, defaultValue: 10 },
        ],
      },
      {
        key: "disk.diskLowInodesDetection",
        label: "Low Disk Inodes",
        type: "detection",
        thresholds: [
          { key: "freeInodesPercentage", label: "Free inodes", unit: "%", min: 1, max: 99, defaultValue: 5 },
        ],
      },
      {
        key: "disk.diskSlowWritesAndReadsDetection",
        label: "Slow Disk I/O",
        type: "detection",
        thresholds: [
          { key: "writeAndReadTime", label: "Write & read time", unit: "ms", min: 0, max: 10000, defaultValue: 300 },
        ],
      },
    ],
  },
];

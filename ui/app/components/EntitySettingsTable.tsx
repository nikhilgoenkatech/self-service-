import React, { useMemo, useState, useCallback } from "react";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { FormField, Label, Select, TextInput } from "@dynatrace/strato-components/forms";
import { showToast } from "@dynatrace/strato-components/notifications";
import { CheckmarkIcon, CheckmarkSmallIcon, EditIcon, XmarkIcon, MinusIcon, SettingIcon } from "@dynatrace/strato-icons";
import type { FieldDef, ThresholdDef } from "../config";
import type { EntityItem } from "../hooks/useEntities";
import type { SettingsObject } from "../hooks/useSettings";
import { useAudit } from "../context/AuditContext";
import { SessionMetaModal } from "./SessionMetaModal";

type DetectionMode = "disabled" | "auto" | "custom";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) => acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
    obj
  );
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split(".");
  const clone = { ...obj };
  let cursor: Record<string, unknown> = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cursor[k] = typeof cursor[k] === "object" && cursor[k] !== null ? { ...(cursor[k] as object) } : {};
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return clone;
}

function getDetectionMode(val: unknown): DetectionMode {
  if (!val || typeof val !== "object") return "disabled";
  const det = val as Record<string, unknown>;
  if (!det.enabled) return "disabled";
  return det.detectionMode === "custom" ? "custom" : "auto";
}

const MODE_ICON: Record<DetectionMode, JSX.Element> = {
  disabled: <MinusIcon style={{ color: "#6b7280", width: 14, height: 14, flexShrink: 0 }} />,
  auto:     <CheckmarkSmallIcon style={{ color: "#10b981", width: 14, height: 14, flexShrink: 0 }} />,
  custom:   <SettingIcon style={{ color: "#f59e0b", width: 14, height: 14, flexShrink: 0 }} />,
};

const MODE_LABEL: Record<DetectionMode, string> = {
  disabled: "Off",
  auto: "Auto",
  custom: "Custom",
};

function ValBadge({ mode, thresholds, val }: { mode: DetectionMode; thresholds?: ThresholdDef[]; val: unknown }): JSX.Element {
  const ct = mode === "custom" && val && typeof val === "object"
    ? (val as Record<string, unknown>).customThresholds as Record<string, unknown> | undefined
    : undefined;
  const summary = ct && thresholds?.length
    ? thresholds.map((t) => `${t.label}: ${ct[t.key]}${t.unit ?? ""}`).join(", ")
    : null;

  return (
    <Flex flexDirection="column" gap={4} style={{ justifyContent: "center" }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 12, border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)",
        borderRadius: 6, padding: "3px 8px", color: "var(--dt-colors-text-secondary, #a1a1aa)",
        width: "fit-content",
      }}>
        {MODE_ICON[mode]}
        {MODE_LABEL[mode]}
      </div>
      {summary && (
        <Text style={{ fontSize: 11, color: "var(--dt-colors-text-muted, #71717a)" }}>{summary}</Text>
      )}
    </Flex>
  );
}

/* Threshold panel shown in the expanded row during editing */
function CustomThresholdsPanel({
  fields,
  draft,
  setDraft,
}: {
  fields: FieldDef[];
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}): JSX.Element | null {
  const customFields = fields.filter((f) => {
    const val = getNestedValue(draft, f.key);
    return getDetectionMode(val) === "custom" && f.thresholds?.length;
  });

  if (!customFields.length) return null;

  return (
    <div style={{
      border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)",
      borderRadius: 8, padding: "12px 16px",
      background: "var(--dt-colors-background-container-neutral-default, rgba(255,255,255,0.03))",
    }}>
      <Text textStyle="small" style={{ fontWeight: 600, fontSize: 12, display: "block", marginBottom: 10 }}>
        Custom thresholds
      </Text>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        {customFields.map((field) => {
          const current = getNestedValue(draft, field.key) as Record<string, unknown> | undefined;
          const ct = (current?.customThresholds as Record<string, unknown>) ?? {};
          return (
            <div key={field.key}>
              <Text textStyle="small" style={{ fontSize: 11, color: "var(--dt-colors-text-muted, #71717a)", display: "block", marginBottom: 6 }}>
                {field.label}
              </Text>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {field.thresholds?.map((t) => (
                  <FormField key={t.key} style={{ minWidth: 140 }}>
                    <Label style={{ fontSize: 11 }}>{t.label}{t.unit ? ` (${t.unit})` : ""}</Label>
                    <TextInput
                      value={String(ct[t.key] ?? t.defaultValue)}
                      onChange={(val) => {
                        const num = Number(val);
                        if (!isNaN(num)) {
                          setDraft((d) => setNestedValue(d, `${field.key}.customThresholds.${t.key}`, num));
                        }
                      }}
                    />
                  </FormField>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface EntitySettingsTableProps {
  entities: EntityItem[];
  settings: Record<string, SettingsObject>;
  onSettingsUpdate: (entityId: string, updated: SettingsObject) => void;
  fields: FieldDef[];
  schemaId: string;
  schemaVersion: string;
  loadingEntities: boolean;
  loadingSettings: boolean;
}

export function EntitySettingsTable({
  entities,
  settings,
  onSettingsUpdate,
  fields,
  schemaId,
  schemaVersion,
  loadingEntities,
  loadingSettings,
}: EntitySettingsTableProps) {
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const { sessionMeta, setSessionMeta, appendChanges } = useAudit();

  const detectionFields = useMemo(() => fields.filter((f) => f.type === "detection"), [fields]);

  const tabLabel = useMemo(() => {
    if (schemaId.includes("infrastructure-hosts")) return "Infrastructure Anomaly";
    if (schemaId.includes("infrastructure-disks")) return "Disk Anomaly";
    return schemaId;
  }, [schemaId]);

  const filteredEntities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter((e) => e.displayName.toLowerCase().includes(q));
  }, [entities, searchQuery]);

  const startEdit = useCallback((entityId: string) => {
    const obj = settings[entityId];
    setDraft(obj ? { ...obj.value } : {});
    setEditingEntityId(entityId);
    // Only expand if there are custom-threshold fields to show
    const hasCustom = detectionFields.some((f) => {
      const val = obj ? getNestedValue(obj.value, f.key) : undefined;
      return getDetectionMode(val) === "custom";
    });
    if (hasCustom) setExpandedRows((prev) => ({ ...prev, [entityId]: true }));
  }, [settings, detectionFields]);

  const cancelEdit = useCallback(() => {
    setEditingEntityId((prev) => {
      if (prev) setExpandedRows((rows) => ({ ...rows, [prev]: false }));
      return null;
    });
    setDraft({});
  }, []);

  const doSave = useCallback(async () => {
    if (!editingEntityId) return;
    const settingsObj = settings[editingEntityId];
    if (!settingsObj) return;
    setSaving(true);
    try {
      const hasOwnObject = settingsObj.scope === editingEntityId;

      // Sanitize detection fields before PUT:
      // - Strip customThresholds from non-custom fields (DT stores them internally but rejects on PUT)
      // - For custom fields: strip null values from customThresholds.
      //   If eventThresholds was completely null/absent AND the field config provides eventThresholdsDefaults,
      //   inject those defaults. Each detection field has a different eventThresholds schema — never add
      //   fields not already in the stored value unless explicitly listed in eventThresholdsDefaults.
      function stripNulls(obj: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v === null || v === undefined) continue;
          out[k] = typeof v === "object" && !Array.isArray(v)
            ? stripNulls(v as Record<string, unknown>)
            : v;
        }
        return out;
      }
      // DT's Settings API requires ALL schema fields in the PUT body — sending only managed fields
      // causes "Must not be null" for unmanaged ones (outOfThreadsDetection, etc.).
      // Strategy: deep-strip-nulls the full stored DT value as the base (preserving all required fields),
      // then overlay our managed detection fields with sanitized values from draft.
      function deepStripNulls(v: unknown): unknown {
        if (v === null || v === undefined) return undefined;
        if (Array.isArray(v)) return v;
        if (typeof v === "object") {
          const out: Record<string, unknown> = {};
          for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
            const cleaned = deepStripNulls(val);
            if (cleaned !== undefined) out[k] = cleaned;
          }
          return out;
        }
        return v;
      }

      // Start from the full stored value with nulls stripped (satisfies all required fields)
      let valueToSave = (deepStripNulls(settingsObj.value) ?? {}) as Record<string, unknown>;

      // Overlay each managed detection field with the sanitized draft value
      for (const field of detectionFields) {
        const val = getNestedValue(draft, field.key);
        if (val === undefined || !val || typeof val !== "object") continue;
        const det = val as Record<string, unknown>;
        const mode = getDetectionMode(val);
        if (mode !== "custom") {
          const { customThresholds: _ct, ...rest } = det;
          void _ct;
          valueToSave = setNestedValue(valueToSave, field.key, rest);
        } else {
          const rawCt = (det.customThresholds && typeof det.customThresholds === "object")
            ? det.customThresholds as Record<string, unknown>
            : {};
          const etWasNullOrAbsent = rawCt.eventThresholds === null || rawCt.eventThresholds === undefined;
          const cleaned = stripNulls(rawCt);
          if (etWasNullOrAbsent && field.eventThresholdsDefaults) {
            cleaned.eventThresholds = { ...field.eventThresholdsDefaults };
          }
          valueToSave = setNestedValue(valueToSave, field.key, { ...det, customThresholds: cleaned });
        }
      }

      console.log("[doSave] valueToSave:", JSON.stringify(valueToSave, null, 2));
      const res = await fetch("/api/updateSetting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaId,
          schemaVersion: settingsObj.schemaVersion || schemaVersion,
          scope: editingEntityId,
          value: valueToSave,
          ...(hasOwnObject ? { objectId: settingsObj.objectId } : {}),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { success?: boolean; error?: string; objectId?: string };
      if (!result.success) throw new Error(result.error ?? "Save failed");

      const entity = entities.find((e) => e.entityId === editingEntityId);
      const name = entity?.displayName ?? editingEntityId;

      const describeVal = (val: unknown, fieldDef: typeof detectionFields[number]): string => {
        const mode = getDetectionMode(val);
        if (mode !== "custom") return mode;
        const ct = val && typeof val === "object"
          ? ((val as Record<string, unknown>).customThresholds as Record<string, unknown> | undefined)
          : undefined;
        if (!ct || !fieldDef.thresholds?.length) return "custom";
        const parts = fieldDef.thresholds.map((t) => `${t.label}: ${ct[t.key]}${t.unit ?? ""}`);
        return `custom (${parts.join(", ")})`;
      };

      const changes = detectionFields
        .map((f) => {
          const oldVal = getNestedValue(settingsObj.value, f.key);
          const newVal = getNestedValue(draft, f.key);
          if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return null;
          return {
            hostName: name, hostId: editingEntityId, tab: tabLabel,
            field: f.label, oldValue: describeVal(oldVal, f), newValue: describeVal(newVal, f),
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      if (changes.length) appendChanges(changes);

      showToast({ title: "Saved", message: `Updated settings for ${name}`, type: "success" });
      onSettingsUpdate(editingEntityId, {
        ...settingsObj,
        objectId: result.objectId ?? settingsObj.objectId,
        scope: editingEntityId,
        value: valueToSave,
      });
      setExpandedRows((rows) => ({ ...rows, [editingEntityId]: false }));
      setEditingEntityId(null);
      setDraft({});
    } catch (err) {
      showToast({ title: "Save failed", message: err instanceof Error ? err.message : String(err), type: "critical" });
    } finally {
      setSaving(false);
    }
  }, [editingEntityId, settings, schemaId, schemaVersion, draft, entities, onSettingsUpdate, detectionFields, tabLabel, appendChanges]);

  const save = useCallback(() => {
    if (!sessionMeta) { setPendingSave(true); } else { void doSave(); }
  }, [sessionMeta, doSave]);

  const handleModeChange = useCallback((fieldKey: string, newMode: string | null, thresholds?: ThresholdDef[]) => {
    if (!newMode) return;
    setDraft((d) => {
      const current = getNestedValue(d, fieldKey) as Record<string, unknown> | undefined;
      const { customThresholds: _ct, ...base } = (current ?? {}) as Record<string, unknown>;
      void _ct;
      if (newMode === "disabled") {
        return setNestedValue(d, fieldKey, { ...base, enabled: false, detectionMode: "auto" });
      } else if (newMode === "auto") {
        return setNestedValue(d, fieldKey, { ...base, enabled: true, detectionMode: "auto" });
      } else {
        const defaults: Record<string, unknown> = {};
        for (const t of thresholds ?? []) defaults[t.key] = t.defaultValue;
        const existing = ((current?.customThresholds) as Record<string, unknown>) ?? {};
        return setNestedValue(d, fieldKey, { ...base, enabled: true, detectionMode: "custom", customThresholds: { ...defaults, ...existing } });
      }
    });
    // Auto-expand the row for threshold editing when switching to custom
    if (newMode === "custom" && editingEntityId) {
      setExpandedRows((prev) => ({ ...prev, [editingEntityId]: true }));
    }
  }, [editingEntityId]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo((): DataTableColumnDef<EntityItem, any>[] => [
    {
      id: "entity",
      header: "Host",
      accessor: "displayName" as const,
      width: 260,
      cell: ({ rowData }: { rowData: EntityItem }) => {
        const obj = settings[rowData.entityId];
        const isInherited = obj && obj.scope !== rowData.entityId;
        return (
          <Flex flexDirection="column" gap={4} style={{ padding: "4px 0", justifyContent: "center" }}>
            <Flex gap={6} alignItems="flex-start">
              <Text textStyle="base-emphasized" style={{ fontSize: 13, wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal", flex: 1, minWidth: 0 }}>
                {rowData.displayName}
              </Text>
              {isInherited && (
                <span style={{ fontSize: 10, border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)", borderRadius: 4, padding: "1px 5px", color: "var(--dt-colors-text-muted, #71717a)", whiteSpace: "nowrap" as const, flexShrink: 0, marginTop: 2 }}>
                  Inherited
                </span>
              )}
            </Flex>
            <Text textStyle="small" style={{ fontSize: 11, color: "var(--dt-colors-text-muted, #71717a)", fontFamily: "monospace", wordBreak: "break-all" }}>
              {rowData.entityId}
            </Text>
          </Flex>
        );
      },
    },
    // One column per detection field
    ...detectionFields.map((field) => ({
      id: field.key,
      header: field.label,
      accessor: "entityId" as const,
      width: "auto" as const,
      cell: ({ rowData }: { rowData: EntityItem }) => {
        const isEditing = editingEntityId === rowData.entityId;
        if (isEditing) {
          const current = getNestedValue(draft, field.key);
          const mode = getDetectionMode(current);
          return (
            <Flex alignItems="center" style={{ height: "100%" }}>
              <Select value={mode} onChange={(v) => handleModeChange(field.key, v, field.thresholds)}>
                <Select.Content>
                  <Select.Option value="disabled">Off</Select.Option>
                  <Select.Option value="auto">Auto</Select.Option>
                  <Select.Option value="custom">Custom</Select.Option>
                </Select.Content>
              </Select>
            </Flex>
          );
        }
        if (loadingSettings) return <Skeleton width={80} height={24} />;
        const obj = settings[rowData.entityId];
        const val = obj ? getNestedValue(obj.value, field.key) : undefined;
        return (
          <Flex alignItems="center" style={{ height: "100%" }}>
            <ValBadge mode={getDetectionMode(val)} thresholds={field.thresholds} val={val} />
          </Flex>
        );
      },
    })),
    {
      id: "actions",
      header: "",
      accessor: "entityId" as const,
      width: 140,
      cell: ({ rowData }: { rowData: EntityItem }) => {
        if (editingEntityId === rowData.entityId) {
          return (
            <Flex gap={4} alignItems="center" style={{ height: "100%" }}>
              <Button variant="accent" size="condensed" onClick={() => void save()} loading={saving}>
                <Button.Prefix><CheckmarkIcon /></Button.Prefix>
                Save
              </Button>
              <Button variant="default" size="condensed" onClick={cancelEdit} disabled={saving}>
                <Button.Prefix><XmarkIcon /></Button.Prefix>
              </Button>
            </Flex>
          );
        }
        return (
          <Flex alignItems="center" style={{ height: "100%" }}>
            <Button variant="default" size="condensed" onClick={() => startEdit(rowData.entityId)} disabled={!settings[rowData.entityId] || !!editingEntityId}>
              <Button.Prefix><EditIcon /></Button.Prefix>
              Edit
            </Button>
          </Flex>
        );
      },
    },
  ], [settings, detectionFields, editingEntityId, draft, saving, save, startEdit, cancelEdit, handleModeChange, loadingSettings]);

  if (loadingEntities) {
    return (
      <Flex flexDirection="column" gap={8}>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={52} />)}
      </Flex>
    );
  }

  if (entities.length === 0) {
    return <Text>No entities visible to your account. IAM policies may restrict your view.</Text>;
  }

  const hasAnyCustom = editingEntityId !== null && detectionFields.some((f) => {
    const val = getNestedValue(draft, f.key);
    return getDetectionMode(val) === "custom";
  });

  return (
    <>
      {pendingSave && (
        <SessionMetaModal
          onConfirm={(meta) => { setSessionMeta(meta); setPendingSave(false); void doSave(); }}
          onDismiss={() => setPendingSave(false)}
        />
      )}
      <Flex flexDirection="column" gap={12}>
        <div style={{ maxWidth: 360 }}>
          <TextInput placeholder="Search hosts..." value={searchQuery} onChange={setSearchQuery} />
        </div>

        {filteredEntities.length === 0 && searchQuery && (
          <Text style={{ color: "var(--dt-colors-text-muted, #71717a)", fontSize: 13 }}>
            No hosts match "{searchQuery}"
          </Text>
        )}

        <DataTable
          columns={columns}
          data={filteredEntities}
          loading={loadingSettings}
          rowId={(row) => row.entityId}
          style={{ width: "100%", minWidth: "100%" }}
        >
          {/* Expandable row shows threshold panel — only when editing a custom-mode field */}
          <DataTable.ExpandableRow
            expandedRows={expandedRows}
            onExpandedRowsChange={setExpandedRows}
            disableExpand={(row: EntityItem) => !hasAnyCustom || editingEntityId !== row.entityId}
          >
            {({ row }: { row: EntityItem }) => (
              <div style={{ padding: "12px 16px" }}>
                <CustomThresholdsPanel fields={detectionFields} draft={draft} setDraft={setDraft} />
              </div>
            )}
          </DataTable.ExpandableRow>
        </DataTable>
      </Flex>
    </>
  );
}

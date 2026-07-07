import React, { useMemo, useState, useCallback } from "react";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { FormField, Label, Select, TextInput } from "@dynatrace/strato-components/forms";
import { showToast } from "@dynatrace/strato-components/notifications";
import { CheckmarkIcon, EditIcon, XmarkIcon } from "@dynatrace/strato-icons";
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


const DOT_COLOR: Record<DetectionMode, string> = {
  disabled: "#6b7280",
  auto: "#10b981",
  custom: "#f59e0b",
};

function ValBadge({ mode, thresholds, val }: { mode: DetectionMode; thresholds?: ThresholdDef[]; val: unknown }): JSX.Element {
  const label = mode === "disabled" ? "Off" : mode === "auto" ? "Auto" : "Custom";
  const ct = mode === "custom" && val && typeof val === "object"
    ? (val as Record<string, unknown>).customThresholds as Record<string, unknown> | undefined
    : undefined;
  const summary = ct && thresholds?.length
    ? `${thresholds[0].label}: ${ct[thresholds[0].key]}${thresholds[0].unit ?? ""}`
    : null;

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 12, border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)",
      borderRadius: 6, padding: "3px 8px", color: "var(--dt-colors-text-secondary, #a1a1aa)",
      whiteSpace: "nowrap" as const,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: DOT_COLOR[mode], display: "inline-block", flexShrink: 0 }} />
      {label}
      {summary && <span style={{ color: "var(--dt-colors-text-muted, #71717a)", fontSize: 11 }}>{summary}</span>}
    </div>
  );
}

/* Threshold panel shown below the table when any detection is in custom mode */
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
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
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

  const { sessionMeta, setSessionMeta, appendChanges } = useAudit();

  const detectionFields = useMemo(() => fields.filter((f) => f.type === "detection"), [fields]);

  const tabLabel = useMemo(() => {
    // derive a readable tab name from the schemaId
    if (schemaId.includes("infrastructure-hosts")) return "Infrastructure Anomaly";
    if (schemaId.includes("infrastructure-disks")) return "Disk Anomaly";
    return schemaId;
  }, [schemaId]);

  const startEdit = useCallback((entityId: string) => {
    const obj = settings[entityId];
    setDraft(obj ? { ...obj.value } : {});
    setEditingEntityId(entityId);
  }, [settings]);

  const cancelEdit = useCallback(() => { setEditingEntityId(null); setDraft({}); }, []);

  const doSave = useCallback(async () => {
    if (!editingEntityId) return;
    const settingsObj = settings[editingEntityId];
    if (!settingsObj) return;
    setSaving(true);
    try {
      const hasOwnObject = settingsObj.scope === editingEntityId;
      const res = await fetch("/api/updateSetting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaId,
          schemaVersion: settingsObj.schemaVersion || schemaVersion,
          scope: editingEntityId,
          value: draft,
          ...(hasOwnObject ? { objectId: settingsObj.objectId } : {}),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as { success?: boolean; error?: string; objectId?: string };
      if (!result.success) throw new Error(result.error ?? "Save failed");

      const entity = entities.find((e) => e.entityId === editingEntityId);
      const name = entity?.displayName ?? editingEntityId;

      // Log each field that changed
      const changes = detectionFields
        .map((f) => {
          const oldVal = getNestedValue(settingsObj.value, f.key);
          const newVal = getNestedValue(draft, f.key);
          const oldMode = getDetectionMode(oldVal);
          const newMode = getDetectionMode(newVal);
          if (oldMode === newMode) return null;
          return {
            hostName: name,
            hostId: editingEntityId,
            tab: tabLabel,
            field: f.label,
            oldValue: oldMode,
            newValue: newMode,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      if (changes.length) appendChanges(changes);

      showToast({ title: "Saved", message: `Updated settings for ${name}`, type: "success" });
      onSettingsUpdate(editingEntityId, {
        ...settingsObj,
        objectId: result.objectId ?? settingsObj.objectId,
        scope: editingEntityId,
        value: draft,
      });
      setEditingEntityId(null);
      setDraft({});
    } catch (err) {
      showToast({ title: "Save failed", message: err instanceof Error ? err.message : String(err), type: "critical" });
    } finally {
      setSaving(false);
    }
  }, [editingEntityId, settings, schemaId, schemaVersion, draft, entities, onSettingsUpdate, detectionFields, tabLabel, appendChanges]);

  const save = useCallback(() => {
    if (!sessionMeta) {
      setPendingSave(true); // show modal — doSave will be called after meta is confirmed
    } else {
      void doSave();
    }
  }, [sessionMeta, doSave]);

  const handleModeChange = useCallback((fieldKey: string, newMode: string | null, thresholds?: ThresholdDef[]) => {
    if (!newMode) return;
    setDraft((d) => {
      const current = getNestedValue(d, fieldKey) as Record<string, unknown> | undefined;
      // Always strip customThresholds when leaving custom mode
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
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo((): DataTableColumnDef<EntityItem, any>[] => {
    const isEditing = (id: string) => id === editingEntityId;

    return [
      {
        id: "entity",
        header: "Host",
        accessor: "displayName" as const,
        width: 220,
        cell: ({ rowData }: { rowData: EntityItem }) => {
          const obj = settings[rowData.entityId];
          const isInherited = obj && obj.scope !== rowData.entityId;
          return (
            <Flex flexDirection="column" gap={2} style={{ padding: "6px 0", minWidth: 0 }}>
              <Flex gap={6} alignItems="center">
                <Text textStyle="base-emphasized" style={{ fontSize: 13, wordBreak: "break-word", overflowWrap: "anywhere" }}>
                  {rowData.displayName}
                </Text>
                {isInherited && (
                  <span style={{
                    fontSize: 10, border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)",
                    borderRadius: 4, padding: "1px 5px", color: "var(--dt-colors-text-muted, #71717a)",
                    whiteSpace: "nowrap" as const, flexShrink: 0,
                  }}>
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
      ...detectionFields.map((field) => ({
        id: field.key,
        header: field.label,
        accessor: "entityId" as const,
        width: "auto" as const,
        cell: ({ rowData }: { rowData: EntityItem }) => {
          const obj = settings[rowData.entityId];
          if (isEditing(rowData.entityId)) {
            const current = getNestedValue(draft, field.key);
            const mode = getDetectionMode(current);
            return (
              <Select
                value={mode}
                onChange={(v) => handleModeChange(field.key, v, field.thresholds)}
              >
                <Select.Content>
                  <Select.Option value="disabled">Disabled</Select.Option>
                  <Select.Option value="auto">Auto</Select.Option>
                  <Select.Option value="custom">Custom</Select.Option>
                </Select.Content>
              </Select>
            );
          }
          const val = obj ? getNestedValue(obj.value, field.key) : undefined;
          return <ValBadge mode={getDetectionMode(val)} thresholds={field.thresholds} val={val} />;
        },
      })),
      {
        id: "actions",
        header: "",
        accessor: "entityId" as const,
        width: 130,
        cell: ({ rowData }: { rowData: EntityItem }) => {
          if (isEditing(rowData.entityId)) {
            return (
              <Flex gap={4}>
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
            <Button
              variant="default"
              size="condensed"
              onClick={() => startEdit(rowData.entityId)}
              disabled={!settings[rowData.entityId]}
            >
              <Button.Prefix><EditIcon /></Button.Prefix>
              Edit
            </Button>
          );
        },
      },
    ];
  }, [settings, detectionFields, editingEntityId, draft, saving, save, startEdit, cancelEdit, handleModeChange]);

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

  return (
    <>
      {pendingSave && (
        <SessionMetaModal
          onConfirm={(meta) => {
            setSessionMeta(meta);
            setPendingSave(false);
            void doSave();
          }}
          onDismiss={() => setPendingSave(false)}
        />
      )}
      <Flex flexDirection="column" gap={12}>
        <DataTable
          columns={columns}
          data={entities}
          loading={loadingSettings}
          rowId={(row) => row.entityId}
          style={{ width: "100%" }}
        />
        {editingEntityId && (
          <CustomThresholdsPanel
            fields={detectionFields}
            draft={draft}
            setDraft={setDraft}
          />
        )}
      </Flex>
    </>
  );
}

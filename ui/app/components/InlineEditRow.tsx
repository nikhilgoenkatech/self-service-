import React, { useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { FormField, Label, Select, Switch, TextInput } from "@dynatrace/strato-components/forms";
import { Flex } from "@dynatrace/strato-components/layouts";
import { showToast } from "@dynatrace/strato-components/notifications";
import { Text } from "@dynatrace/strato-components/typography";
import { CheckmarkIcon, EditIcon, XmarkIcon } from "@dynatrace/strato-icons";
import type { FieldDef, ThresholdDef } from "../config";
import type { SettingsObject } from "../hooks/useSettings";

interface InlineEditRowProps {
  entity: { entityId: string; displayName: string };
  settingsObj: SettingsObject | undefined;
  fields: FieldDef[];
  schemaId: string;
  schemaVersion: string;
  onSaved: () => void;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === "object"
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    obj
  );
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const keys = path.split(".");
  const clone = { ...obj };
  let cursor: Record<string, unknown> = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cursor[k] =
      typeof cursor[k] === "object" && cursor[k] !== null
        ? { ...(cursor[k] as object) }
        : {};
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return clone;
}

type DetectionMode = "disabled" | "auto" | "custom";

function getDetectionMode(val: unknown): DetectionMode {
  if (!val || typeof val !== "object") return "disabled";
  const det = val as Record<string, unknown>;
  if (!det.enabled) return "disabled";
  return det.detectionMode === "custom" ? "custom" : "auto";
}

function DetectionBadge({ mode }: { mode: DetectionMode }) {
  const background =
    mode === "disabled" ? "#888" : mode === "auto" ? "#1ab394" : "#f0a500";
  const label =
    mode === "disabled" ? "Off" : mode === "auto" ? "Auto" : "Custom";
  return (
    <span
      style={{
        background,
        color: "#fff",
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function DetectionEditor({
  fieldKey,
  fieldLabel,
  thresholds,
  draft,
  setDraft,
}: {
  fieldKey: string;
  fieldLabel: string;
  thresholds?: ThresholdDef[];
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const current = getNestedValue(draft, fieldKey) as
    | Record<string, unknown>
    | undefined;
  const mode = getDetectionMode(current);

  const handleModeChange = (newMode: string | null) => {
    if (!newMode) return;
    if (newMode === "disabled") {
      setDraft((d) =>
        setNestedValue(d, fieldKey, {
          ...(current ?? {}),
          enabled: false,
          detectionMode: "auto",
        })
      );
    } else if (newMode === "auto") {
      setDraft((d) =>
        setNestedValue(d, fieldKey, {
          ...(current ?? {}),
          enabled: true,
          detectionMode: "auto",
        })
      );
    } else {
      // custom — seed with default thresholds, preserve any existing values
      const defaults: Record<string, unknown> = {};
      for (const t of thresholds ?? []) defaults[t.key] = t.defaultValue;
      const existing =
        ((current as Record<string, unknown> | undefined)
          ?.customThresholds as Record<string, unknown>) ?? {};
      setDraft((d) =>
        setNestedValue(d, fieldKey, {
          ...(current ?? {}),
          enabled: true,
          detectionMode: "custom",
          customThresholds: { ...defaults, ...existing },
        })
      );
    }
  };

  return (
    <Flex flexDirection="column" gap={4} style={{ minWidth: 160 }}>
      <FormField>
        <Label>{fieldLabel}</Label>
        <Select value={mode} onChange={handleModeChange}>
          <Select.Content>
            <Select.Option value="disabled">Disabled</Select.Option>
            <Select.Option value="auto">Auto</Select.Option>
            <Select.Option value="custom">Custom</Select.Option>
          </Select.Content>
        </Select>
      </FormField>
      {mode === "custom" &&
        thresholds?.map((t) => {
          const customThresholds = (
            current as Record<string, unknown> | undefined
          )?.customThresholds as Record<string, unknown> | undefined;
          const tVal = (
            customThresholds !== undefined ? customThresholds[t.key] : t.defaultValue
          ) as number;
          return (
            <FormField key={t.key}>
              <Label>
                {t.label}
                {t.unit ? ` (${t.unit})` : ""}
              </Label>
              <TextInput
                value={String(tVal ?? t.defaultValue)}
                onChange={(val) => {
                  const num = Number(val);
                  if (!isNaN(num)) {
                    setDraft((d) =>
                      setNestedValue(
                        d,
                        `${fieldKey}.customThresholds.${t.key}`,
                        num
                      )
                    );
                  }
                }}
              />
            </FormField>
          );
        })}
    </Flex>
  );
}

export function InlineEditRow({
  entity,
  settingsObj,
  fields,
  schemaId,
  schemaVersion,
  onSaved,
}: InlineEditRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(settingsObj ? { ...settingsObj.value } : {});
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);

  const save = async () => {
    if (!settingsObj) return;
    setSaving(true);
    try {
      const res = await fetch("/api/updateSetting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaId,
          schemaVersion: settingsObj.schemaVersion || schemaVersion,
          scope: settingsObj.scope,
          value: draft,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = (await res.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!result.success) throw new Error(result.error ?? "Save failed");
      showToast({
        title: "Saved",
        message: `Updated ${entity.displayName}`,
        type: "success",
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast({ title: "Save failed", message: msg, type: "critical" });
    } finally {
      setSaving(false);
    }
  };

  const currentValues = editing ? draft : (settingsObj?.value ?? {});

  return (
    <Flex flexDirection="column" gap={8} padding={8}>
      {/* Entity name */}
      <Text textStyle="base-emphasized" style={{ wordBreak: "break-word" }}>
        {entity.displayName}
      </Text>

      {/* Fields */}
      <Flex gap={12} flexWrap="wrap" alignItems="flex-start">
        {fields.map((field) => {
          if (field.type === "detection") {
            if (editing) {
              return (
                <DetectionEditor
                  key={field.key}
                  fieldKey={field.key}
                  fieldLabel={field.label}
                  thresholds={field.thresholds}
                  draft={draft}
                  setDraft={setDraft}
                />
              );
            }
            const val = getNestedValue(currentValues, field.key);
            const mode = getDetectionMode(val);
            return (
              <Flex
                key={field.key}
                flexDirection="column"
                gap={2}
                style={{ minWidth: 100 }}
              >
                <Text textStyle="small">{field.label}</Text>
                <DetectionBadge mode={mode} />
              </Flex>
            );
          }

          // boolean / string / number (used by log monitoring)
          const val = getNestedValue(currentValues, field.key);
          return (
            <Flex
              key={field.key}
              flexDirection="column"
              gap={2}
              style={{ minWidth: 120 }}
            >
              <Text textStyle="small">{field.label}</Text>
              <Switch
                value={val === true}
                onChange={
                  editing
                    ? (checked) =>
                        setDraft((d) => setNestedValue(d, field.key, checked))
                    : undefined
                }
                disabled={!editing}
              />
            </Flex>
          );
        })}
      </Flex>

      {/* Actions */}
      <Flex gap={8}>
        {!editing && (
          <Button
            variant="default"
            onClick={startEdit}
            disabled={!settingsObj}
          >
            <Button.Prefix>
              <EditIcon />
            </Button.Prefix>
            Edit
          </Button>
        )}
        {editing && (
          <>
            <Button
              variant="accent"
              onClick={() => void save()}
              loading={saving}
            >
              <Button.Prefix>
                <CheckmarkIcon />
              </Button.Prefix>
              Save
            </Button>
            <Button variant="default" onClick={cancelEdit}>
              <Button.Prefix>
                <XmarkIcon />
              </Button.Prefix>
              Cancel
            </Button>
          </>
        )}
      </Flex>
    </Flex>
  );
}

import React, { useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { FormField, Label, Switch, TextInput } from "@dynatrace/strato-components/forms";
import { Flex } from "@dynatrace/strato-components/layouts";
import { showToast } from "@dynatrace/strato-components/notifications";
import { Text } from "@dynatrace/strato-components/typography";
import { CheckmarkIcon, EditIcon, XmarkIcon } from "@dynatrace/strato-icons";
import type { FieldDef } from "../config";
import type { SettingsObject } from "../hooks/useSettings";

interface InlineEditRowProps {
  entity: { entityId: string; displayName: string };
  settingsObj: SettingsObject | undefined;
  fields: FieldDef[];
  schemaId: string;
  onSaved: () => void;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
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

export function InlineEditRow({
  entity,
  settingsObj,
  fields,
  schemaId,
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
          objectId: settingsObj.objectId,
          schemaId,
          schemaVersion: settingsObj.schemaVersion,
          scope: settingsObj.scope,
          value: draft,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast({
        title: "Saved",
        message: `Settings updated for ${entity.displayName}`,
        type: "success",
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[InlineEditRow save]", msg);
      showToast({ title: "Save failed", message: msg, type: "critical" });
    } finally {
      setSaving(false);
    }
  };

  const currentValues = editing ? draft : (settingsObj?.value ?? {});

  return (
    <Flex gap={8} alignItems="center" flexWrap="wrap" padding={4}>
      {/* Entity name */}
      <Text style={{ minWidth: 220, fontWeight: 500 }}>
        {entity.displayName}
      </Text>

      {/* Setting fields */}
      {fields.map((field) => {
        const val = getNestedValue(currentValues, field.key);

        if (field.type === "boolean") {
          return (
            <Flex
              key={field.key}
              flexDirection="column"
              gap={2}
              style={{ minWidth: 140 }}
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
        }

        return (
          <FormField key={field.key} style={{ minWidth: 140 }}>
            <Label>{field.label}</Label>
            <TextInput
              value={val !== undefined ? String(val) : ""}
              onChange={
                editing
                  ? (value) =>
                      setDraft((d) =>
                        setNestedValue(
                          d,
                          field.key,
                          field.type === "number" ? Number(value) : value
                        )
                      )
                  : undefined
              }
              disabled={!editing}
            />
          </FormField>
        );
      })}

      {/* Action buttons */}
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
        <Flex gap={4}>
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
        </Flex>
      )}
    </Flex>
  );
}

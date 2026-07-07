import React, { useEffect, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { FormField, Label, TextInput } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { Skeleton } from "@dynatrace/strato-components/content";
import { showToast } from "@dynatrace/strato-components/notifications";
import { CheckmarkIcon } from "@dynatrace/strato-icons";

interface SyntheticConfig {
  bmMonitorTimeout: number;
  bmStepTimeout: number;
}

export function SyntheticConfig() {
  const [config, setConfig] = useState<SyntheticConfig | null>(null);
  const [draft, setDraft] = useState<SyntheticConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/getSyntheticConfig", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then((r) => r.json() as Promise<{ config?: SyntheticConfig; error?: string }>)
      .then((res) => {
        if (res.error) throw new Error(res.error);
        if (res.config) setConfig(res.config);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const startEdit = () => {
    if (config) { setDraft({ ...config }); setEditing(true); }
  };

  const cancel = () => { setEditing(false); setDraft(null); };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/updateSyntheticConfig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      }).then((r) => r.json() as Promise<{ success: boolean; error?: string }>);
      if (!res.success) throw new Error(res.error ?? "Save failed");
      setConfig({ ...draft });
      setEditing(false);
      setDraft(null);
      showToast({ title: "Saved", message: "Synthetic configuration updated", type: "success" });
    } catch (err) {
      showToast({ title: "Save failed", message: err instanceof Error ? err.message : String(err), type: "critical" });
    } finally {
      setSaving(false);
    }
  };

  const msToSec = (ms: number) => String(Math.round(ms / 1000));
  const secToMs = (s: string) => Math.max(1000, Math.round(Number(s) * 1000));

  return (
    <Flex flexDirection="column" gap={16} padding={20}>
      <Flex flexDirection="column" gap={4}>
        <Heading level={3}>Synthetic Monitoring Configuration</Heading>
        <Text textStyle="small" style={{ color: "var(--dt-colors-text-muted, #71717a)" }}>
          Global timeout settings for browser monitor execution
        </Text>
      </Flex>

      {error && <Text style={{ color: "red" }}>Error: {error}</Text>}

      {loading ? (
        <Flex flexDirection="column" gap={12}>
          <Skeleton width={400} height={52} />
          <Skeleton width={400} height={52} />
        </Flex>
      ) : config ? (
        <div style={{
          border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)",
          borderRadius: 8, padding: "20px 24px",
          background: "var(--dt-colors-background-container-neutral-default, rgba(255,255,255,0.03))",
          maxWidth: 480,
        }}>
          <Flex flexDirection="column" gap={16}>
            <FormField>
              <Label>Browser monitor timeout (seconds)</Label>
              {editing ? (
                <TextInput
                  value={msToSec(draft!.bmMonitorTimeout)}
                  onChange={(v) => setDraft((d) => d ? { ...d, bmMonitorTimeout: secToMs(v) } : d)}
                />
              ) : (
                <Text style={{ fontSize: 14, paddingTop: 4 }}>{msToSec(config.bmMonitorTimeout)}s</Text>
              )}
            </FormField>

            <FormField>
              <Label>Browser monitor step timeout (seconds)</Label>
              {editing ? (
                <TextInput
                  value={msToSec(draft!.bmStepTimeout)}
                  onChange={(v) => setDraft((d) => d ? { ...d, bmStepTimeout: secToMs(v) } : d)}
                />
              ) : (
                <Text style={{ fontSize: 14, paddingTop: 4 }}>{msToSec(config.bmStepTimeout)}s</Text>
              )}
            </FormField>

            <Flex gap={8} style={{ marginTop: 4 }}>
              {editing ? (
                <>
                  <Button variant="accent" size="condensed" onClick={() => void save()} loading={saving}>
                    <Button.Prefix><CheckmarkIcon /></Button.Prefix>
                    Save
                  </Button>
                  <Button variant="default" size="condensed" onClick={cancel} disabled={saving}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="default" size="condensed" onClick={startEdit}>
                  Edit
                </Button>
              )}
            </Flex>
          </Flex>
        </div>
      ) : null}
    </Flex>
  );
}

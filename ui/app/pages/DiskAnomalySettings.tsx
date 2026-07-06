import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { EntitySettingsTable } from "../components/EntitySettingsTable";
import { useEntities } from "../hooks/useEntities";
import { useSettings } from "../hooks/useSettings";
import { TABS } from "../config";

const TAB = TABS.find((t) => t.id === "disk-anomaly")!;

export function DiskAnomalySettings() {
  const { entities, loading: loadingEntities, error: entityError } = useEntities(TAB.entityType);
  const entityIds = entities.map((e) => e.entityId);
  const { settings, setSettings, loading: loadingSettings, error: settingsError } = useSettings(TAB.schemaId, entityIds);

  return (
    <Flex flexDirection="column" gap={16} padding={20}>
      <Flex flexDirection="column" gap={4}>
        <Heading level={3}>Disk Anomaly Settings</Heading>
        <Text textStyle="small" style={{ color: "var(--dt-colors-text-muted, #71717a)" }}>
          Hosts you have access to
          {entities.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, background: "var(--dt-colors-background-accent-default, #1a4fd8)", color: "#fff", borderRadius: 20, padding: "1px 8px" }}>
              {entities.length} host{entities.length !== 1 ? "s" : ""}
            </span>
          )}
        </Text>
      </Flex>

      {entityError && <Text style={{ color: "red" }}>Entity load error: {entityError}</Text>}
      {settingsError && (
        <pre style={{ color: "red", whiteSpace: "pre-wrap", fontSize: 12, border: "1px solid red", padding: 8, borderRadius: 4 }}>
          Settings error: {settingsError}
        </pre>
      )}

      <EntitySettingsTable
        entities={entities}
        settings={settings}
        fields={TAB.fields}
        schemaId={TAB.schemaId}
        schemaVersion={TAB.schemaVersion}
        loadingEntities={loadingEntities}
        loadingSettings={loadingSettings}
        onSettingsUpdate={(entityId, updated) => setSettings((prev) => ({ ...prev, [entityId]: updated }))}
      />
    </Flex>
  );
}

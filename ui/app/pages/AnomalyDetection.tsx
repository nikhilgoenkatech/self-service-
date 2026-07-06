import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { EntitySettingsTable } from "../components/EntitySettingsTable";
import { useEntities } from "../hooks/useEntities";
import { useSettings } from "../hooks/useSettings";
import { TABS } from "../config";

const TAB = TABS.find((t) => t.id === "anomaly-detection")!;

export function AnomalyDetection() {
  const { entities, loading: loadingEntities, error: entityError } =
    useEntities(TAB.entityType);

  const entityIds = entities.map((e) => e.entityId);

  const {
    settings,
    loading: loadingSettings,
    error: settingsError,
    refresh,
  } = useSettings(TAB.schemaId, entityIds);

  return (
    <Flex flexDirection="column" gap={16} padding={20}>
      <Heading level={3}>Anomaly Detection — Infrastructure Hosts</Heading>

      {entityError && (
        <Text color="critical">Entity load error: {entityError}</Text>
      )}
      {settingsError && (
        <pre style={{ color: "red", whiteSpace: "pre-wrap", fontSize: 12, border: "1px solid red", padding: 8 }}>
          Settings error: {settingsError}
        </pre>
      )}

      <EntitySettingsTable
        entities={entities}
        settings={settings}
        fields={TAB.fields}
        schemaId={TAB.schemaId}
        loadingEntities={loadingEntities}
        loadingSettings={loadingSettings}
        onSaved={refresh}
      />
    </Flex>
  );
}

import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { EntitySettingsTable } from "../components/EntitySettingsTable";
import { useEntities } from "../hooks/useEntities";
import { useSettings } from "../hooks/useSettings";
import { TABS } from "../config";

const TAB = TABS.find((t) => t.id === "log-monitoring")!;

export function LogMonitoring() {
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
      <Heading level={3}>Log Monitoring — Storage Settings</Heading>

      {entityError && (
        <Text color="critical">Entity load error: {entityError}</Text>
      )}
      {settingsError && (
        <Text color="critical">Settings load error: {settingsError}</Text>
      )}

      <EntitySettingsTable
        entities={entities}
        settings={settings}
        fields={TAB.fields}
        schemaId={TAB.schemaId}
        schemaVersion={TAB.schemaVersion}
        loadingEntities={loadingEntities}
        loadingSettings={loadingSettings}
        onSaved={refresh}
      />
    </Flex>
  );
}

import React, { useMemo } from "react";
import { DataTable } from "@dynatrace/strato-components/tables";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { InlineEditRow } from "./InlineEditRow";
import type { FieldDef } from "../config";
import type { EntityItem } from "../hooks/useEntities";
import type { SettingsObject } from "../hooks/useSettings";

interface EntitySettingsTableProps {
  entities: EntityItem[];
  settings: Record<string, SettingsObject>;
  fields: FieldDef[];
  schemaId: string;
  loadingEntities: boolean;
  loadingSettings: boolean;
  onSaved: () => void;
}

export function EntitySettingsTable({
  entities,
  settings,
  fields,
  schemaId,
  loadingEntities,
  loadingSettings,
  onSaved,
}: EntitySettingsTableProps) {
  const columns = useMemo(
    () => [
      {
        id: "entity",
        header: "Entity / Settings",
        accessor: "entityId" as const,
        width: "auto" as const,
        cell: ({ rowData }: { rowData: EntityItem }) => (
          <InlineEditRow
            entity={rowData}
            settingsObj={settings[rowData.entityId]}
            fields={fields}
            schemaId={schemaId}
            onSaved={onSaved}
          />
        ),
      },
    ],
    [settings, fields, schemaId, onSaved]
  );

  if (loadingEntities) {
    return (
      <Flex flexDirection="column" gap={8} padding={8}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={48} />
        ))}
      </Flex>
    );
  }

  if (entities.length === 0) {
    return (
      <Text>
        No entities visible to your account. IAM policies may restrict your
        view.
      </Text>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={entities}
      loading={loadingSettings}
      rowId={(row) => row.entityId}
    />
  );
}

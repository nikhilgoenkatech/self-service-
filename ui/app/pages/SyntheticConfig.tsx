import React, { useEffect, useState, useCallback } from "react";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { FormField, Label, TextInput, Switch, Checkbox } from "@dynatrace/strato-components/forms";
import { Button } from "@dynatrace/strato-components/buttons";
import { Skeleton } from "@dynatrace/strato-components/content";
import { showToast } from "@dynatrace/strato-components/notifications";
import { CheckmarkIcon, EditIcon, XmarkIcon } from "@dynatrace/strato-icons";
import { useAudit } from "../context/AuditContext";
import { SessionMetaModal } from "../components/SessionMetaModal";

interface MonitorSummary {
  entityId: string;
  name: string;
  type: string;
  enabled: boolean;
  frequencyMin?: number;
  locationCount?: number;
}

interface LocationOption {
  entityId: string;
  name: string;
  type: string;
}

interface MonitorDraft {
  enabled: boolean;
  frequencyMin: number;
  locationIds: string[];
}

export function SyntheticConfig() {
  const [monitors, setMonitors] = useState<MonitorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullMonitor, setFullMonitor] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<MonitorDraft | null>(null);
  const [availableLocations, setAvailableLocations] = useState<LocationOption[]>([]);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);

  const { sessionMeta, setSessionMeta, appendChanges } = useAudit();

  useEffect(() => {
    setLoading(true);
    fetch("/api/getSyntheticMonitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then((r) => r.json() as Promise<{ monitors?: MonitorSummary[]; error?: string }>)
      .then((res) => {
        if (res.error) throw new Error(res.error);
        setMonitors(res.monitors ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const startEdit = useCallback((entityId: string) => {
    setEditingId(entityId);
    setLoadingEdit(true);
    setFullMonitor(null);
    setDraft(null);
    setAvailableLocations([]);

    Promise.all([
      fetch("/api/getSyntheticMonitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId: entityId }),
      }).then((r) => r.json() as Promise<{ monitor?: Record<string, unknown>; error?: string }>),
      fetch("/api/getSyntheticLocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => r.json() as Promise<{ locations?: LocationOption[]; error?: string }>),
    ])
      .then(([monRes, locRes]) => {
        if (monRes.error) throw new Error(monRes.error);
        const m = monRes.monitor!;
        setFullMonitor(m);

        // Log raw data to console so we can inspect the actual format
        console.log("[synthetic] raw m.locations:", JSON.stringify(m.locations));
        console.log("[synthetic] available locations:", JSON.stringify(locRes.locations?.map(l => l.entityId)));

        // Extract location entityIds — handle both string[] and {entityId}[] formats
        const rawLocs = (m.locations as Array<Record<string, unknown> | string>) ?? [];
        const locationIds = rawLocs
          .map((l) => typeof l === "string" ? l : String((l as Record<string, unknown>).entityId ?? ""))
          .filter(Boolean);

        console.log("[synthetic] extracted locationIds:", locationIds);

        setDraft({
          enabled: !!m.enabled,
          frequencyMin: (m.frequencyMin as number) ?? 15,
          locationIds,
        });

        setAvailableLocations(locRes.locations ?? []);

        // Update the monitor summary to show frequency and location count
        setMonitors((prev) => prev.map((mon) =>
          mon.entityId === entityId
            ? { ...mon, frequencyMin: (m.frequencyMin as number) ?? undefined, locationCount: locationIds.length }
            : mon
        ));
      })
      .catch((err) => {
        showToast({ title: "Failed to load monitor", message: err instanceof Error ? err.message : String(err), type: "critical" });
        setEditingId(null);
      })
      .finally(() => setLoadingEdit(false));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setFullMonitor(null);
    setDraft(null);
  }, []);

  const doSave = useCallback(async () => {
    if (!editingId || !fullMonitor || !draft) return;
    setSaving(true);
    try {
      const rawLocs = (fullMonitor.locations as Array<Record<string, unknown> | string>) ?? [];
      const origLocationIds = rawLocs.map((l) => typeof l === "string" ? l : String(l.entityId ?? "")).filter(Boolean);

      // v1 PUT expects locations as a plain array of entityId strings
      const updatedLocations = draft.locationIds;

      console.log("[synthetic] draft.locationIds before save:", draft.locationIds);
      console.log("[synthetic] updatedLocations to PUT:", JSON.stringify(updatedLocations));

      const updated = { ...fullMonitor, enabled: draft.enabled, frequencyMin: draft.frequencyMin, locations: updatedLocations };
      const res = await fetch("/api/updateSyntheticMonitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorId: editingId, monitor: updated }),
      }).then((r) => r.json() as Promise<{ success: boolean; error?: string }>);
      if (!res.success) throw new Error(res.error ?? "Save failed");

      const monitorName = monitors.find((m) => m.entityId === editingId)?.name ?? editingId;
      const oldEnabled = !!fullMonitor.enabled;
      const oldFreq = (fullMonitor.frequencyMin as number) ?? 15;

      const changes: Array<{ hostName: string; hostId: string; tab: string; field: string; oldValue: string; newValue: string }> = [];
      if (oldEnabled !== draft.enabled) {
        changes.push({ hostName: monitorName, hostId: editingId, tab: "Synthetic Monitors", field: "Enabled", oldValue: String(oldEnabled), newValue: String(draft.enabled) });
      }
      if (oldFreq !== draft.frequencyMin) {
        changes.push({ hostName: monitorName, hostId: editingId, tab: "Synthetic Monitors", field: "Frequency (min)", oldValue: String(oldFreq), newValue: String(draft.frequencyMin) });
      }
      const addedLocs = draft.locationIds.filter((id) => !origLocationIds.includes(id));
      const removedLocs = origLocationIds.filter((id) => !draft.locationIds.includes(id));
      if (addedLocs.length || removedLocs.length) {
        const nameOf = (id: string) => availableLocations.find((l) => l.entityId === id)?.name ?? id;
        const oldLocStr = origLocationIds.map(nameOf).join(", ") || "(none)";
        const newLocStr = draft.locationIds.map(nameOf).join(", ") || "(none)";
        changes.push({ hostName: monitorName, hostId: editingId, tab: "Synthetic Monitors", field: "Locations", oldValue: oldLocStr, newValue: newLocStr });
      }
      if (changes.length) appendChanges(changes);

      setMonitors((prev) => prev.map((m) =>
        m.entityId === editingId
          ? { ...m, enabled: draft.enabled, frequencyMin: draft.frequencyMin, locationCount: draft.locationIds.length }
          : m
      ));
      showToast({ title: "Saved", message: `Updated ${monitorName}`, type: "success" });
      cancelEdit();
    } catch (err) {
      showToast({ title: "Save failed", message: err instanceof Error ? err.message : String(err), type: "critical" });
    } finally {
      setSaving(false);
    }
  }, [editingId, fullMonitor, draft, monitors, availableLocations, appendChanges, cancelEdit]);

  const save = useCallback(() => {
    if (!sessionMeta) { setPendingSave(true); } else { void doSave(); }
  }, [sessionMeta, doSave]);

  const toggleLocation = useCallback((locId: string, checked: boolean) => {
    setDraft((d) => {
      if (!d) return d;
      const ids = checked ? [...d.locationIds, locId] : d.locationIds.filter((id) => id !== locId);
      return { ...d, locationIds: ids };
    });
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: DataTableColumnDef<MonitorSummary, any>[] = [
    {
      id: "name",
      header: "Monitor name",
      accessor: "name" as const,
      width: 260,
      cell: ({ rowData }: { rowData: MonitorSummary }) => (
        <Flex flexDirection="column" gap={2} style={{ padding: "6px 0" }}>
          <Text textStyle="base-emphasized" style={{ fontSize: 13 }}>{rowData.name}</Text>
          <Text textStyle="small" style={{ fontSize: 11, color: "var(--dt-colors-text-muted, #71717a)", fontFamily: "monospace" }}>{rowData.entityId}</Text>
        </Flex>
      ),
    },
    {
      id: "type",
      header: "Type",
      accessor: "type" as const,
      width: 90,
      cell: ({ rowData }: { rowData: MonitorSummary }) => (
        <span style={{ fontSize: 12, border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)", borderRadius: 6, padding: "3px 8px", color: "var(--dt-colors-text-secondary, #a1a1aa)" }}>
          {rowData.type}
        </span>
      ),
    },
    {
      id: "enabled",
      header: "Status",
      accessor: "enabled" as const,
      width: 120,
      cell: ({ rowData }: { rowData: MonitorSummary }) => {
        if (editingId === rowData.entityId && draft) {
          return (
            <Switch value={draft.enabled} onChange={(v) => setDraft((d) => d ? { ...d, enabled: v } : d)} />
          );
        }
        return (
          <span style={{ fontSize: 12, border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)", borderRadius: 6, padding: "3px 8px", color: rowData.enabled ? "#10b981" : "#6b7280" }}>
            {rowData.enabled ? "Enabled" : "Disabled"}
          </span>
        );
      },
    },
    {
      id: "frequency",
      header: "Frequency (min)",
      accessor: "frequencyMin" as const,
      width: 150,
      cell: ({ rowData }: { rowData: MonitorSummary }) => {
        if (editingId === rowData.entityId) {
          if (loadingEdit) return <Skeleton width={80} height={28} />;
          if (draft) {
            return (
              <TextInput
                style={{ width: 80 }}
                value={String(draft.frequencyMin)}
                onChange={(v) => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) setDraft((d) => d ? { ...d, frequencyMin: n } : d); }}
              />
            );
          }
        }
        return <Text style={{ fontSize: 13 }}>{rowData.frequencyMin != null ? String(rowData.frequencyMin) : "—"}</Text>;
      },
    },
    {
      id: "locations",
      header: "Locations",
      accessor: "locationCount" as const,
      width: 100,
      cell: ({ rowData }: { rowData: MonitorSummary }) => (
        <Text style={{ fontSize: 13 }}>{rowData.locationCount != null ? `${rowData.locationCount} location${rowData.locationCount !== 1 ? "s" : ""}` : "—"}</Text>
      ),
    },
    {
      id: "actions",
      header: "",
      accessor: "entityId" as const,
      width: 130,
      cell: ({ rowData }: { rowData: MonitorSummary }) => {
        if (editingId === rowData.entityId) {
          return (
            <Flex gap={4}>
              <Button variant="accent" size="condensed" onClick={() => void save()} loading={saving || loadingEdit} disabled={loadingEdit}>
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
          <Button variant="default" size="condensed" onClick={() => startEdit(rowData.entityId)} disabled={!!editingId}>
            <Button.Prefix><EditIcon /></Button.Prefix>
            Edit
          </Button>
        );
      },
    },
  ];

  return (
    <>
      {pendingSave && (
        <SessionMetaModal
          onConfirm={(meta) => { setSessionMeta(meta); setPendingSave(false); void doSave(); }}
          onDismiss={() => setPendingSave(false)}
        />
      )}
      <Flex flexDirection="column" gap={16} padding={20}>
        <Flex flexDirection="column" gap={4}>
          <Heading level={3}>Synthetic Monitors</Heading>
          <Text textStyle="small" style={{ color: "var(--dt-colors-text-muted, #71717a)" }}>
            View and edit synthetic monitor configuration
          </Text>
        </Flex>

        {error && <Text style={{ color: "red" }}>Error: {error}</Text>}

        {loading ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={52} />)}
          </Flex>
        ) : (
          <DataTable
            columns={columns}
            data={monitors}
            rowId={(row) => row.entityId}
            style={{ width: "100%", minWidth: "100%" }}
          />
        )}

        {/* Locations edit panel */}
        {editingId && draft && !loadingEdit && availableLocations.length > 0 && (
          <div style={{
            border: "0.5px solid var(--dt-colors-border-neutral-default, #3f3f46)",
            borderRadius: 8, padding: "16px 20px",
            background: "var(--dt-colors-background-container-neutral-default, rgba(255,255,255,0.03))",
          }}>
            <Text textStyle="small" style={{ fontWeight: 600, fontSize: 12, display: "block", marginBottom: 12 }}>
              Locations — {monitors.find((m) => m.entityId === editingId)?.name}
            </Text>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "6px 24px" }}>
              {availableLocations.map((loc) => (
                <Flex key={loc.entityId} gap={8} alignItems="center" style={{ padding: "3px 0" }}>
                  <Checkbox
                    value={draft.locationIds.includes(loc.entityId)}
                    onChange={(checked) => toggleLocation(loc.entityId, checked)}
                  />
                  <Flex flexDirection="column" gap={4}>
                    <Text style={{ fontSize: 13 }}>{loc.name}</Text>
                    <Text style={{ fontSize: 10, color: "var(--dt-colors-text-muted, #71717a)" }}>{loc.type}</Text>
                  </Flex>
                </Flex>
              ))}
            </div>
          </div>
        )}
      </Flex>
    </>
  );
}

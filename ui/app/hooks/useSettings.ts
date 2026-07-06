import React, { useCallback, useEffect, useState } from "react";

export interface SettingsObject {
  objectId: string;
  entityId: string;
  schemaVersion: string;
  scope: string;
  value: Record<string, unknown>;
}

interface UseSettingsResult {
  settings: Record<string, SettingsObject>;
  setSettings: React.Dispatch<React.SetStateAction<Record<string, SettingsObject>>>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface GetSettingsResponse {
  items?: SettingsObject[];
  error?: string;
}

/**
 * Fetches settings objects for the given schema + entity list via the
 * getSettings app function. The admin token stays server-side.
 */
export function useSettings(
  schemaId: string,
  entityIds: string[]
): UseSettingsResult {
  const [settings, setSettings] = useState<Record<string, SettingsObject>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const entityKey = entityIds.join(",");

  useEffect(() => {
    if (!schemaId || entityIds.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/getSettings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schemaId, entityIds }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          console.error("[useSettings] function error", res.status, body);
          throw new Error(`getSettings failed: ${res.status} - ${body}`);
        }
        return res.json() as Promise<GetSettingsResponse | SettingsObject[]>;
      })
      .then((response) => {
        if (cancelled) return;

        const items = Array.isArray(response)
          ? response
          : (response.items ?? []);
        const responseError = Array.isArray(response)
          ? undefined
          : response.error;

        if (responseError) {
          throw new Error(responseError);
        }

        const map: Record<string, SettingsObject> = {};
        for (const item of items) map[item.entityId] = item;
        setSettings(map);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[useSettings]", msg);
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaId, entityKey, tick]);

  return { settings, setSettings, loading, error, refresh };
}

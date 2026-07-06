import { useEffect, useState } from "react";
import { monitoredEntitiesClient } from "@dynatrace-sdk/client-classic-environment-v2";

export interface EntityItem {
  entityId: string;
  displayName: string;
}

interface UseEntitiesResult {
  entities: EntityItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches entities of the given type using the logged-in user's IAM context.
 * The SDK automatically scopes results to what the user is allowed to see.
 */
export function useEntities(entityType: string): UseEntitiesResult {
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await monitoredEntitiesClient.getEntities({
          entitySelector: `type(${entityType})`,
          pageSize: 500,
        });
        if (!cancelled) {
          setEntities(
            (result.entities ?? []).map((e) => ({
              entityId: e.entityId ?? "",
              displayName: e.displayName ?? e.entityId ?? "",
            }))
          );
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[useEntities]", msg);
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  return { entities, loading, error };
}

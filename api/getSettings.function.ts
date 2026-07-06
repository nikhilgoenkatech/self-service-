import { credentialVaultClient } from "@dynatrace-sdk/client-classic-environment-v2";

const VAULT_CREDENTIAL_ID = "CREDENTIALS_VAULT-511FC1F27BC482FA";

interface Payload {
  schemaId: string;
  entityIds: string[];
}

interface SettingsEntry {
  objectId: string;
  entityId: string;
  schemaVersion: string;
  scope: string;
  value: Record<string, unknown>;
}

interface SettingsResponse {
  items: SettingsEntry[];
  error?: string;
}

async function fetchAdminToken(): Promise<string> {
  const data = await credentialVaultClient.getCredentialsDetails({
    id: VAULT_CREDENTIAL_ID,
  }) as { token?: string };
  if (!data.token) {
    throw new Error(`Vault credential has no token field. Ensure type=TOKEN and scope=APP_ENGINE.`);
  }
  return data.token;
}

function classicUrl(environmentUrl: string): string {
  return (environmentUrl ?? "")
    .replace(/\/$/, "")
    .replace(".apps.dynatrace.com", ".live.dynatrace.com");
}

export default async function (payload: Payload): Promise<SettingsResponse> {
  const base = classicUrl((globalThis as any).environmentUrl ?? "");

  try {
    const { schemaId, entityIds } = payload;
    if (!base) throw new Error("environmentUrl global is not set in this runtime.");
    if (!schemaId || !Array.isArray(entityIds)) throw new Error("schemaId and entityIds are required");

    const token = await fetchAdminToken();

    // Fetch ALL objects for this schema in one call.
    // This returns both the environment-level object (scope="environment") and any
    // host-specific overrides (scope="HOST-XXXXXXXX"). We then build the map ourselves,
    // using the HOST-specific object when it exists, falling back to the environment object.
    const allItems: Array<{ objectId: string; schemaVersion: string; scope: string; value: Record<string, unknown> }> = [];
    let nextPageKey: string | undefined;
    do {
      const url = nextPageKey
        ? `${base}/api/v2/settings/objects?schemaIds=${encodeURIComponent(schemaId)}&pageSize=500&nextPageKey=${encodeURIComponent(nextPageKey)}`
        : `${base}/api/v2/settings/objects?schemaIds=${encodeURIComponent(schemaId)}&pageSize=500`;
      const res = await fetch(url, { headers: { Authorization: `Api-Token ${token}` } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`getSettings failed: ${res.status} ${body.substring(0, 300)}`);
      }
      const data = await res.json() as {
        items: Array<{ objectId: string; schemaVersion: string; scope: string; value: Record<string, unknown> }>;
        nextPageKey?: string;
      };
      allItems.push(...(data.items ?? []));
      nextPageKey = data.nextPageKey;
    } while (nextPageKey);

    // Index all objects by scope. HOST-specific objects have scope = "HOST-XXXXXXXX".
    const byScope = new Map<string, typeof allItems[0]>();
    for (const item of allItems) {
      byScope.set(item.scope, item);
    }

    console.log("[getSettings] all scopes found:", JSON.stringify([...byScope.keys()]));

    // Environment-level object: scope is "environment" or the tenant/environment ID.
    // Find it as the non-entity-type scope (anything that doesn't look like HOST-xxx).
    const envItem = [...byScope.entries()].find(([scope]) =>
      scope != null && !scope.match(/^[A-Z_]+-[0-9A-F]+$/)
    )?.[1];

    const items: SettingsEntry[] = entityIds.map((entityId) => {
      // Use the HOST-specific override if it exists; otherwise fall back to environment.
      const item = byScope.get(entityId) ?? envItem;
      if (!item) return null as unknown as SettingsEntry;
      return {
        objectId: item.objectId,
        entityId,
        schemaVersion: item.schemaVersion ?? "",
        scope: byScope.has(entityId) ? entityId : (envItem?.scope ?? "environment"),
        value: item.value,
      };
    }).filter(Boolean);

    return { items };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

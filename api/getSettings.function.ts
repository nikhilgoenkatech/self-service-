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

type DtItem = { objectId: string; schemaVersion: string; scope: string; value: Record<string, unknown> };

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

async function fetchItems(url: string, token: string): Promise<DtItem[]> {
  const res = await fetch(url, { headers: { Authorization: `Api-Token ${token}` } });
  if (!res.ok) return [];
  const data = await res.json() as { items?: DtItem[] };
  return data.items ?? [];
}

export default async function (payload: Payload): Promise<SettingsResponse> {
  const base = classicUrl((globalThis as any).environmentUrl ?? "");

  try {
    const { schemaId, entityIds } = payload;
    if (!base) throw new Error("environmentUrl global is not set in this runtime.");
    if (!schemaId || !Array.isArray(entityIds)) throw new Error("schemaId and entityIds are required");

    const token = await fetchAdminToken();

    // fields=objectId,scope,schemaVersion,value ensures DT returns the scope field
    // (it is NOT included in the default field set).
    const fields = "objectId,scope,schemaVersion,value";

    // Step 1: fetch the environment-level object — the inherited baseline for all hosts.
    const envItems = await fetchItems(
      `${base}/api/v2/settings/objects?schemaIds=${encodeURIComponent(schemaId)}&scope=environment&fields=${fields}&pageSize=10`,
      token
    );
    const envObject = envItems[0] ?? null;

    // Step 2: for each host, fetch with fields=scope so we can tell whether the returned
    // object actually belongs to this host (scope===entityId) or is inherited.
    const results = await Promise.allSettled(
      entityIds.map(async (entityId): Promise<SettingsEntry | null> => {
        const items = await fetchItems(
          `${base}/api/v2/settings/objects?schemaIds=${encodeURIComponent(schemaId)}&scope=${encodeURIComponent(entityId)}&fields=${fields}&pageSize=50`,
          token
        );
        const ownItem = items.find(i => i.scope === entityId) ?? null;
        const item = ownItem ?? envObject;
        if (!item) return null;
        return {
          objectId: item.objectId,
          entityId,
          schemaVersion: item.schemaVersion ?? "",
          scope: ownItem ? entityId : "environment",
          value: item.value,
        };
      })
    );

    return {
      items: results
        .filter((r): r is PromiseFulfilledResult<SettingsEntry | null> => r.status === "fulfilled")
        .map(r => r.value)
        .filter((v): v is SettingsEntry => v !== null),
    };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

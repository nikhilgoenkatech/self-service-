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

async function fetchAdminToken(base: string): Promise<string> {
  const url = `${base}/api/v2/credentials/${encodeURIComponent(VAULT_CREDENTIAL_ID)}/details`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vault ${res.status}: ${body.substring(0, 200)}`);
  }
  const data = await res.json() as { token?: string };
  if (!data.token) {
    throw new Error(`Vault credential has no token field. Ensure type=TOKEN and scope=APP_ENGINE.`);
  }
  return data.token;
}

export default async function (payload: Payload): Promise<SettingsEntry[]> {
  const g = globalThis as any;
  const base: string = (g.environmentUrl as string ?? "").replace(/\/$/, "");

  const { schemaId, entityIds } = payload;

  const token = await fetchAdminToken(base);

  const results = await Promise.allSettled(
    entityIds.map(async (entityId): Promise<SettingsEntry | null> => {
      const url = `${base}/api/v2/settings/objects?schemaIds=${encodeURIComponent(schemaId)}&scope=${encodeURIComponent(entityId)}&pageSize=1`;
      const res = await fetch(url, {
        headers: { Authorization: `Api-Token ${token}` },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${entityId}: ${res.status} ${body.substring(0, 200)}`);
      }
      const data = await res.json() as { items: Array<{ objectId: string; schemaVersion: string; scope: string; value: Record<string, unknown> }> };
      const item = data.items?.[0];
      if (!item) return null;
      return {
        objectId: item.objectId,
        entityId,
        schemaVersion: item.schemaVersion ?? "",
        scope: item.scope ?? entityId,
        value: item.value,
      };
    })
  );

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map(r => String(r.reason));
  if (errors.length) throw new Error(errors.join("; "));

  return results
    .filter((r): r is PromiseFulfilledResult<SettingsEntry | null> => r.status === "fulfilled")
    .map(r => r.value)
    .filter((v): v is SettingsEntry => v !== null);
}

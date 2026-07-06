const VAULT_CREDENTIAL_ID = "CREDENTIALS_VAULT-511FC1F27BC482FA";

interface Payload {
  objectId: string;
  schemaId: string;
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

export default async function (payload: Payload): Promise<{ success: boolean }> {
  const g = globalThis as any;
  const base: string = (g.environmentUrl as string ?? "").replace(/\/$/, "");

  const { objectId, schemaId, schemaVersion, scope, value } = payload;
  if (!objectId || !schemaId || !value) {
    throw new Error("objectId, schemaId and value are required");
  }

  const token = await fetchAdminToken(base);

  const res = await fetch(`${base}/api/v2/settings/objects/${encodeURIComponent(objectId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Api-Token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ schemaId, schemaVersion, scope, value }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Settings update failed (${res.status}): ${errText.substring(0, 300)}`);
  }

  return { success: true };
}

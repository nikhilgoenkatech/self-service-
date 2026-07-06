import { credentialVaultClient } from "@dynatrace-sdk/client-classic-environment-v2";

const VAULT_CREDENTIAL_ID = "CREDENTIALS_VAULT-511FC1F27BC482FA";

interface Payload {
  schemaId: string;
  schemaVersion: string;
  scope: string;
  value: Record<string, unknown>;
  /** Provided when the host already has its own settings object (not inherited). Uses PUT instead of POST. */
  objectId?: string;
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

export default async function (payload: Payload): Promise<{ success: boolean; error?: string; objectId?: string }> {
  const base = classicUrl((globalThis as any).environmentUrl ?? "");

  try {
    const { schemaId, schemaVersion, scope, value, objectId } = payload;
    if (!base) throw new Error("environmentUrl global is not set in this runtime.");
    if (!schemaId || !value) throw new Error("schemaId and value are required");

    const token = await fetchAdminToken();

    console.log("[updateSetting] objectId:", objectId, "scope:", scope, "using:", objectId ? "PUT" : "POST");
    // Use PUT when the host already has its own settings object — PUT body is just { value, schemaVersion }.
    // Use POST (array body) when creating a new host-level override from an inherited environment object.
    const res = objectId
      ? await fetch(`${base}/api/v2/settings/objects/${encodeURIComponent(objectId)}`, {
          method: "PUT",
          headers: {
            Authorization: `Api-Token ${token}`,
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ value, schemaVersion }),
        })
      : await fetch(`${base}/api/v2/settings/objects`, {
          method: "POST",
          headers: {
            Authorization: `Api-Token ${token}`,
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json; charset=utf-8",
          },
          body: JSON.stringify([{ schemaId, schemaVersion, scope, value }]),
        });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Settings update failed (${res.status}): ${errText.substring(0, 300)}`);
    }

    // Extract new objectId from response (POST returns array, PUT returns single object)
    let newObjectId: string | undefined;
    try {
      const body = await res.json() as unknown;
      if (Array.isArray(body) && body.length > 0) {
        newObjectId = (body[0] as { objectId?: string }).objectId;
      } else if (body && typeof body === "object") {
        newObjectId = (body as { objectId?: string }).objectId;
      }
    } catch { /* objectId unavailable — caller will fall back to old objectId */ }

    return { success: true, objectId: newObjectId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

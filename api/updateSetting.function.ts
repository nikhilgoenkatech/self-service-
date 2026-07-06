import { credentialVaultClient } from "@dynatrace-sdk/client-classic-environment-v2";
import { VAULT_CREDENTIAL_ID } from "./config";

interface Payload {
  objectId: string;
  schemaId: string;
  schemaVersion: string;
  scope: string;
  value: Record<string, unknown>;
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

function getClassicEnvironmentUrl(environmentUrl: string): string {
  return environmentUrl
    .replace(/\/$/, "")
    .replace(".apps.dynatrace.com", ".live.dynatrace.com");
}

export default async function (payload: Payload): Promise<{ success: boolean; error?: string }> {
  const g = globalThis as any;
  const base = getClassicEnvironmentUrl(g.environmentUrl as string ?? "");

  try {
    const { objectId, schemaId, schemaVersion, scope, value } = payload;
    if (!base) {
      throw new Error("Dynatrace environment URL is not available in the app function runtime.");
    }
    if (!objectId || !schemaId || !value) {
      throw new Error("objectId, schemaId and value are required");
    }

    const token = await fetchAdminToken();

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
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

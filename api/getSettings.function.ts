import { credentialVaultClient } from "@dynatrace-sdk/client-classic-environment-v2";
import { VAULT_CREDENTIAL_ID } from "./config";

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

function getClassicEnvironmentUrl(environmentUrl: string): string {
  return environmentUrl
    .replace(/\/$/, "")
    .replace(".apps.dynatrace.com", ".live.dynatrace.com");
}

export default async function (payload: Payload): Promise<SettingsResponse> {
  const g = globalThis as any;
  const base = getClassicEnvironmentUrl(g.environmentUrl as string ?? "");

  try {
    const { schemaId, entityIds } = payload;
    if (!base) {
      throw new Error("Dynatrace environment URL is not available in the app function runtime.");
    }
    if (!schemaId || !Array.isArray(entityIds)) {
      throw new Error("schemaId and entityIds are required");
    }

    const token = await fetchAdminToken();

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

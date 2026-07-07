import { credentialVaultClient } from "@dynatrace-sdk/client-classic-environment-v2";

const VAULT_CREDENTIAL_ID = "CREDENTIALS_VAULT-511FC1F27BC482FA";

export interface SyntheticMonitorSummary {
  entityId: string;
  name: string;
  type: string;
  enabled: boolean;
}

async function fetchAdminToken(): Promise<string> {
  const data = await credentialVaultClient.getCredentialsDetails({
    id: VAULT_CREDENTIAL_ID,
  }) as { token?: string };
  if (!data.token) throw new Error("Vault credential has no token field.");
  return data.token;
}

function classicUrl(environmentUrl: string): string {
  return (environmentUrl ?? "")
    .replace(/\/$/, "")
    .replace(".apps.dynatrace.com", ".live.dynatrace.com");
}

export default async function (): Promise<{ monitors?: SyntheticMonitorSummary[]; error?: string }> {
  const base = classicUrl((globalThis as any).environmentUrl ?? "");
  try {
    if (!base) throw new Error("environmentUrl global is not set.");
    const token = await fetchAdminToken();

    const all: SyntheticMonitorSummary[] = [];
    let nextPageKey: string | undefined;

    do {
      const url = nextPageKey
        ? `${base}/api/v1/synthetic/monitors?nextPageKey=${encodeURIComponent(nextPageKey)}&pageSize=100`
        : `${base}/api/v1/synthetic/monitors?pageSize=100`;
      const res = await fetch(url, {
        headers: { Authorization: `Api-Token ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GET synthetic monitors failed (${res.status}): ${body.substring(0, 300)}`);
      }
      const data = await res.json() as { monitors?: SyntheticMonitorSummary[]; nextPageKey?: string };
      for (const m of data.monitors ?? []) {
        all.push({ entityId: m.entityId, name: m.name, type: m.type, enabled: m.enabled });
      }
      nextPageKey = data.nextPageKey;
    } while (nextPageKey);

    return { monitors: all };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

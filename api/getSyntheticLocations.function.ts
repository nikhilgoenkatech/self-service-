import { credentialVaultClient } from "@dynatrace-sdk/client-classic-environment-v2";

const VAULT_CREDENTIAL_ID = "CREDENTIALS_VAULT-511FC1F27BC482FA";

export interface SyntheticLocation {
  entityId: string;
  name: string;
  type: string;
  status: string;
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

export default async function (): Promise<{ locations?: SyntheticLocation[]; error?: string }> {
  const base = classicUrl((globalThis as any).environmentUrl ?? "");
  try {
    if (!base) throw new Error("environmentUrl global is not set.");
    const token = await fetchAdminToken();
    const res = await fetch(`${base}/api/v1/synthetic/locations`, {
      headers: { Authorization: `Api-Token ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET locations failed (${res.status}): ${body.substring(0, 300)}`);
    }
    const data = await res.json() as { locations?: Array<{ entityId: string; name: string; type: string; status: string }> };
    const locations = (data.locations ?? [])
      .filter((l) => l.status === "ENABLED")
      .map((l) => ({ entityId: l.entityId, name: l.name, type: l.type, status: l.status }));
    return { locations };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

import { credentialVaultClient } from "@dynatrace-sdk/client-classic-environment-v2";

const VAULT_CREDENTIAL_ID = "CREDENTIALS_VAULT-511FC1F27BC482FA";

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

export default async function (payload: { monitorId: string }): Promise<{ monitor?: Record<string, unknown>; error?: string }> {
  const base = classicUrl((globalThis as any).environmentUrl ?? "");
  try {
    if (!base) throw new Error("environmentUrl global is not set.");
    const token = await fetchAdminToken();
    const res = await fetch(`${base}/api/v1/synthetic/monitors/${encodeURIComponent(payload.monitorId)}`, {
      headers: { Authorization: `Api-Token ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET monitor failed (${res.status}): ${body.substring(0, 300)}`);
    }
    const monitor = await res.json() as Record<string, unknown>;
    return { monitor };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

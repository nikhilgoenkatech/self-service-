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

export default async function (payload: { monitorId: string; monitor: Record<string, unknown> }): Promise<{ success: boolean; error?: string }> {
  const base = classicUrl((globalThis as any).environmentUrl ?? "");
  try {
    if (!base) throw new Error("environmentUrl global is not set.");
    const token = await fetchAdminToken();
    const res = await fetch(`${base}/api/v1/synthetic/monitors/${encodeURIComponent(payload.monitorId)}`, {
      method: "PUT",
      headers: {
        Authorization: `Api-Token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload.monitor),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PUT monitor failed (${res.status}): ${body.substring(0, 300)}`);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

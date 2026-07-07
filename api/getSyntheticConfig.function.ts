import { credentialVaultClient } from "@dynatrace-sdk/client-classic-environment-v2";

const VAULT_CREDENTIAL_ID = "CREDENTIALS_VAULT-511FC1F27BC482FA";

export interface SyntheticConfig {
  bmMonitorTimeout: number;
  bmStepTimeout: number;
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

export default async function (): Promise<{ config?: SyntheticConfig; error?: string }> {
  const base = classicUrl((globalThis as any).environmentUrl ?? "");
  try {
    if (!base) throw new Error("environmentUrl global is not set.");
    const token = await fetchAdminToken();
    const res = await fetch(`${base}/api/v2/synthetic/config`, {
      headers: { Authorization: `Api-Token ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET synthetic config failed (${res.status}): ${body.substring(0, 300)}`);
    }
    const data = await res.json() as Record<string, unknown>;
    // DT response uses either bmMonitorTimeout or browserMonitorTimeout
    return {
      config: {
        bmMonitorTimeout: (data.bmMonitorTimeout ?? data.browserMonitorTimeout ?? 300000) as number,
        bmStepTimeout: (data.bmStepTimeout ?? data.browserMonitorStepTimeout ?? 30000) as number,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

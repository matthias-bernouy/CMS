import type { DevRuntimeConfig, LocalInstanceConnection } from "./config";

export async function provisionLocalInstance(
    providerUrl: string,
    operatorToken: string,
    config: DevRuntimeConfig,
    kernelUrl: string,
): Promise<Omit<LocalInstanceConnection, "schema">> {
    const response = await fetch(`${providerUrl}/ulvia/operator/instances`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${operatorToken}`,
            "content-type": "application/json",
            "idempotency-key": "ulvia-cli-default",
        },
        body: JSON.stringify({
            label: "Local Ulvia instance",
            kernelUrl,
            administrator: { email: config.adminEmail, password: config.adminPassword },
        }),
    });
    if (!response.ok) {
        throw new Error(`Local instance provisioning failed (${response.status})`);
    }
    const value = (await response.json()) as {
        credentials?: { instanceAccessToken?: unknown };
        instance?: { id?: unknown; status?: unknown };
    };
    if (
        typeof value.credentials?.instanceAccessToken !== "string" ||
        typeof value.instance?.id !== "string" ||
        value.instance.status !== "ready"
    ) {
        throw new Error("Local instance provisioning returned an invalid response");
    }
    return {
        instanceId: value.instance.id,
        token: value.credentials.instanceAccessToken,
    };
}

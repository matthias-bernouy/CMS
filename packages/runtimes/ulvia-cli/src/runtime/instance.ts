import type { LocalInstanceConfig } from "./instanceConfig";
import type { LocalInstanceConnection } from "./instanceConnection";

export async function provisionLocalInstance(
    providerUrl: string,
    operatorToken: string,
    config: LocalInstanceConfig,
    kernelUrl: string,
): Promise<Omit<LocalInstanceConnection, "schema">> {
    const response = await fetch(`${providerUrl}/ulvia/operator/instances`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${operatorToken}`,
            "content-type": "application/json",
            "idempotency-key": `ulvia-cli-${config.name}`,
        },
        body: JSON.stringify({
            label: config.label,
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

export async function disableLocalInstance(
    providerUrl: string,
    operatorToken: string,
    instanceId: string,
): Promise<void> {
    const response = await fetch(`${providerUrl}/ulvia/operator/instances/${encodeURIComponent(instanceId)}/disable`, {
        method: "POST",
        headers: { authorization: `Bearer ${operatorToken}` },
    });
    if (!response.ok && response.status !== 404) {
        throw new Error(`Local instance disable failed (${response.status})`);
    }
    await response.body?.cancel();
}

export async function upgradeLocalInstanceProfile(
    providerUrl: string,
    operatorToken: string,
    instanceId: string,
    profile: Readonly<{ id: string; version: string }>,
): Promise<void> {
    const response = await fetch(`${providerUrl}/ulvia/operator/instances/${encodeURIComponent(instanceId)}/profile`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${operatorToken}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(profile),
    });
    if (!response.ok) {
        throw new Error(`Local instance profile upgrade failed (${response.status})`);
    }
    const value = (await response.json()) as {
        status?: unknown;
        profile?: { id?: unknown; version?: unknown };
    };
    if (value.status !== "ready" || value.profile?.id !== profile.id || value.profile.version !== profile.version) {
        throw new Error("Local instance profile upgrade returned an invalid response");
    }
}

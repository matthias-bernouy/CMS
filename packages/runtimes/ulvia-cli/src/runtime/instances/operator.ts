import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { boundedResponseBytes } from "@bernouy/cms-repository/repository/publication/transport";
import type { LocalInstanceConfig } from "./config";
import type { LocalInstanceConnection } from "./connection";

export async function provisionLocalInstance(
    providerUrl: string,
    operatorToken: string,
    config: LocalInstanceConfig,
    cmsUrl: string,
    gatewayUrl: string,
): Promise<Omit<LocalInstanceConnection, "schema">> {
    const response = await fetch(`${providerUrl}/ulvia/operator/instances`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
        headers: {
            authorization: `Bearer ${operatorToken}`,
            "content-type": "application/json",
            "idempotency-key": `ulvia-cli-${config.name}`,
        },
        body: JSON.stringify({
            label: config.label,
            profile: config.profile,
            cmsUrl,
            gatewayUrl,
            administrator: { email: config.adminEmail, password: config.adminPassword },
        }),
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Local instance provisioning failed (${response.status})`);
    }
    const value = parseStrictJson(await boundedResponseBytes(response, 16_384), 16_384, 8) as {
        credentials?: { instanceAccessToken?: unknown };
        instance?: { id?: unknown; status?: unknown; profile?: { id?: unknown; version?: unknown } };
    };
    if (
        typeof value.credentials?.instanceAccessToken !== "string" ||
        typeof value.instance?.id !== "string" ||
        value.instance.status !== "ready" ||
        value.instance.profile?.id !== config.profile.id ||
        value.instance.profile.version !== config.profile.version
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
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
        headers: { authorization: `Bearer ${operatorToken}` },
    });
    if (!response.ok && response.status !== 404) {
        await response.body?.cancel();
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
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
        headers: {
            authorization: `Bearer ${operatorToken}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(profile),
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Local instance profile upgrade failed (${response.status})`);
    }
    const value = parseStrictJson(await boundedResponseBytes(response, 16_384), 16_384, 8) as {
        status?: unknown;
        profile?: { id?: unknown; version?: unknown };
    };
    if (value.status !== "ready" || value.profile?.id !== profile.id || value.profile.version !== profile.version) {
        throw new Error("Local instance profile upgrade returned an invalid response");
    }
}

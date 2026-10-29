import type { ProviderInstanceRuntimeCredentials } from "@bernouy/ulvia-provider";

export function parseInstanceRuntimeCredentials(value: string): ProviderInstanceRuntimeCredentials {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error("Stored Provider instance credentials are invalid");
    }
    if (!validRuntimeCredentials(parsed)) {
        throw new Error("Stored Provider instance credentials are invalid");
    }
    return parsed;
}

function validRuntimeCredentials(value: unknown): value is ProviderInstanceRuntimeCredentials {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        Object.keys(record).sort().join(",") === "instanceAccessToken,invocationSecret,kekHex,sessionSecret" &&
        typeof record.instanceAccessToken === "string" &&
        /^[A-Za-z0-9_-]{43}$/u.test(record.instanceAccessToken) &&
        typeof record.invocationSecret === "string" &&
        /^[A-Za-z0-9_-]{43}$/u.test(record.invocationSecret) &&
        typeof record.sessionSecret === "string" &&
        record.sessionSecret.length >= 32 &&
        typeof record.kekHex === "string" &&
        /^[a-f0-9]{64}$/u.test(record.kekHex)
    );
}

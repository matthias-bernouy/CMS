import { randomBytes } from "node:crypto";
import { providerInvocationKeyId } from "@bernouy/cms-gateway/protocol";
import type { SecretStore } from "@bernouy/secret-store";
import type {
    ProviderInstanceCredentials,
    ProviderInstanceRecord,
    ProviderInstanceRuntimeCredentials,
} from "@bernouy/ulvia-provider";
import type { InstanceCredentialStore } from "./InstanceCredentialStore";
import { hashInstanceToken } from "./ProviderInstanceAuthenticator";

export class EncryptedInstanceCredentials implements ProviderInstanceCredentials {
    constructor(
        private readonly credentials: InstanceCredentialStore,
        private readonly secrets: SecretStore,
    ) {}

    async ensure(instance: ProviderInstanceRecord): Promise<ProviderInstanceRuntimeCredentials> {
        const existing = await this.credentials.getByInstanceId(instance.id);
        if (existing) {
            const credentials = await this.readSecret(existing.secretKey);
            if (!credentials) {
                throw new Error(`Instance credential secret is unavailable: ${instance.id}`);
            }
            return credentials;
        }
        const runtimeCredentials = {
            token: randomBytes(32).toString("base64url"),
            sessionSecret: randomBytes(48).toString("base64url"),
            kekHex: randomBytes(32).toString("hex"),
        };
        const keyId = providerInvocationKeyId(runtimeCredentials.token);
        const secretKey = `ULVIA_INSTANCE_${keyId.replaceAll("-", "_").toUpperCase()}`;
        await this.secrets.set(secretKey, JSON.stringify(runtimeCredentials));
        try {
            await this.credentials.put({
                instanceId: instance.id,
                keyId,
                tokenHash: hashInstanceToken(runtimeCredentials.token),
                secretKey,
                enabled: true,
            });
        } catch (error) {
            await this.secrets.delete(secretKey).catch(() => undefined);
            throw error;
        }
        return runtimeCredentials;
    }

    async read(instanceId: string): Promise<ProviderInstanceRuntimeCredentials | null> {
        const credential = await this.credentials.getByInstanceId(instanceId);
        return credential?.enabled ? this.readSecret(credential.secretKey) : null;
    }

    async disable(instanceId: string): Promise<void> {
        const credential = await this.credentials.getByInstanceId(instanceId);
        if (credential?.enabled) {
            await this.credentials.disable(instanceId, credential.revision);
        }
    }

    async readSecret(secretKey: string): Promise<ProviderInstanceRuntimeCredentials | null> {
        const value = await this.secrets.get(secretKey);
        if (!value) {
            return null;
        }
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
}

function validRuntimeCredentials(value: unknown): value is ProviderInstanceRuntimeCredentials {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        Object.keys(record).sort().join(",") === "kekHex,sessionSecret,token" &&
        typeof record.token === "string" &&
        /^[A-Za-z0-9_-]{43}$/u.test(record.token) &&
        typeof record.sessionSecret === "string" &&
        record.sessionSecret.length >= 32 &&
        typeof record.kekHex === "string" &&
        /^[a-f0-9]{64}$/u.test(record.kekHex)
    );
}

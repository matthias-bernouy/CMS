import { parseInstanceRuntimeCredentials } from "./material/parseInstanceRuntimeCredentials";
import { randomBytes } from "node:crypto";
import { providerInvocationKeyId } from "@bernouy/cms-gateway/protocol";
import type { SecretStore } from "@bernouy/secret-store";
import type {
    ProviderInstanceCredentials,
    ProviderInstanceRecord,
    ProviderInstanceRuntimeCredentials,
} from "@bernouy/ulvia-provider";
import type { InstanceCredentialStore } from "./InstanceCredentialStore";
import { hashInstanceAccessToken } from "./ProviderInstanceAuthenticator";

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
            instanceAccessToken: randomBytes(32).toString("base64url"),
            invocationSecret: randomBytes(32).toString("base64url"),
            sessionSecret: randomBytes(48).toString("base64url"),
            kekHex: randomBytes(32).toString("hex"),
        };
        const keyId = providerInvocationKeyId(runtimeCredentials.invocationSecret);
        const secretKey = `ULVIA_INSTANCE_${keyId.replaceAll("-", "_").toUpperCase()}`;
        await this.secrets.set(secretKey, JSON.stringify(runtimeCredentials));
        try {
            await this.credentials.put({
                instanceId: instance.id,
                invocationKeyId: keyId,
                accessTokenHash: hashInstanceAccessToken(runtimeCredentials.instanceAccessToken),
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

    async stageAdministrator(instanceId: string, administrator: { email: string; password: string }): Promise<void> {
        const credential = await this.requiredCredential(instanceId);
        await this.secrets.set(`${credential.secretKey}_BOOTSTRAP`, JSON.stringify(administrator));
    }

    async readAdministrator(instanceId: string): Promise<{ email: string; password: string } | null> {
        const credential = await this.credentials.getByInstanceId(instanceId);
        if (!credential) {
            return null;
        }
        const value = await this.secrets.get(`${credential.secretKey}_BOOTSTRAP`);
        if (!value) {
            return null;
        }
        const parsed: unknown = JSON.parse(value);
        if (!validAdministrator(parsed)) {
            throw new Error("Stored Provider bootstrap administrator is invalid");
        }
        return parsed;
    }

    async clearAdministrator(instanceId: string): Promise<void> {
        const credential = await this.credentials.getByInstanceId(instanceId);
        if (credential) {
            await this.secrets.delete(`${credential.secretKey}_BOOTSTRAP`);
        }
    }

    async readSecret(secretKey: string): Promise<ProviderInstanceRuntimeCredentials | null> {
        const value = await this.secrets.get(secretKey);
        if (!value) {
            return null;
        }
        return parseInstanceRuntimeCredentials(value);
    }

    private async requiredCredential(instanceId: string) {
        const credential = await this.credentials.getByInstanceId(instanceId);
        if (!credential) {
            throw new Error(`Instance credential is unavailable: ${instanceId}`);
        }
        return credential;
    }
}

function validAdministrator(value: unknown): value is { email: string; password: string } {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        Object.keys(record).sort().join(",") === "email,password" &&
        typeof record.email === "string" &&
        typeof record.password === "string"
    );
}

import { randomBytes } from "node:crypto";
import { providerInvocationKeyId } from "@bernouy/cms-gateway/protocol";
import type { SecretStore } from "@bernouy/secret-store";
import type { ProviderInstanceCredentials, ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { InstanceCredentialStore } from "./InstanceCredentialStore";
import { hashInstanceToken } from "./ProviderInstanceAuthenticator";

export class EncryptedInstanceCredentials implements ProviderInstanceCredentials {
    constructor(
        private readonly credentials: InstanceCredentialStore,
        private readonly secrets: SecretStore,
    ) {}

    async ensure(instance: ProviderInstanceRecord): Promise<string> {
        const existing = await this.credentials.getByInstanceId(instance.id);
        if (existing) {
            const token = await this.secrets.get(existing.secretKey);
            if (!token) {
                throw new Error(`Instance credential secret is unavailable: ${instance.id}`);
            }
            return token;
        }
        const token = randomBytes(32).toString("base64url");
        const keyId = providerInvocationKeyId(token);
        const secretKey = `ULVIA_INSTANCE_${keyId.replaceAll("-", "_").toUpperCase()}`;
        await this.secrets.set(secretKey, token);
        try {
            await this.credentials.put({
                instanceId: instance.id,
                keyId,
                tokenHash: hashInstanceToken(token),
                secretKey,
                enabled: true,
            });
        } catch (error) {
            await this.secrets.delete(secretKey).catch(() => undefined);
            throw error;
        }
        return token;
    }

    async disable(instanceId: string): Promise<void> {
        const credential = await this.credentials.getByInstanceId(instanceId);
        if (credential?.enabled) {
            await this.credentials.disable(instanceId, credential.revision);
        }
    }
}

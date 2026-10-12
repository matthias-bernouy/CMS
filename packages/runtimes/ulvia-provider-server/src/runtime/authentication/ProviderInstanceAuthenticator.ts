import { createHash, timingSafeEqual } from "node:crypto";
import {
    readProviderInvocationKeyId,
    verifyProviderInvocationToken,
    type ProviderInvocationClaims,
} from "@bernouy/cms-gateway/protocol";
import type { SecretReader } from "@bernouy/secret-store";
import type { ProviderInstanceRecord, ProviderInstanceRegistry } from "@bernouy/ulvia-provider";
import type { InstanceCredential, InstanceCredentialStore } from "./InstanceCredentialStore";

export type AuthenticatedInvocation = Readonly<{
    instance: ProviderInstanceRecord;
    claims: ProviderInvocationClaims;
}>;

export class ProviderInstanceAuthenticator {
    constructor(
        private readonly instances: ProviderInstanceRegistry,
        private readonly credentials: InstanceCredentialStore,
        private readonly secrets: SecretReader,
    ) {}

    async authenticateControlToken(token: string): Promise<ProviderInstanceRecord | null> {
        const credential = await this.credentials.getByTokenHash(hashInstanceToken(token));
        if (!credential) {
            return null;
        }
        const secret = await this.readEnabledSecret(credential);
        if (!secret || !equalSecrets(token, secret)) {
            return null;
        }
        return this.readReadyInstance(credential.instanceId);
    }

    async authenticateInvocationToken(token: string): Promise<AuthenticatedInvocation | null> {
        let keyId: string;
        try {
            keyId = readProviderInvocationKeyId(token);
        } catch {
            return null;
        }
        const credential = await this.credentials.getByKeyId(keyId);
        if (!credential) {
            return null;
        }
        const secret = await this.readEnabledSecret(credential);
        if (!secret) {
            return null;
        }
        try {
            const claims = verifyProviderInvocationToken(token, secret);
            if (claims.instanceId !== credential.instanceId) {
                return null;
            }
            const instance = await this.readReadyInstance(credential.instanceId);
            return instance ? { instance, claims } : null;
        } catch {
            return null;
        }
    }

    async readEnabledSecret(credential: InstanceCredential): Promise<string | null> {
        if (!credential.enabled) {
            return null;
        }
        return this.secrets.get(credential.secretKey);
    }

    private async readReadyInstance(instanceId: string): Promise<ProviderInstanceRecord | null> {
        const instance = await this.instances.get(instanceId);
        return instance?.status === "ready" ? instance : null;
    }
}

export function hashInstanceToken(token: string): string {
    return createHash("sha256").update("ulvia-provider-control-token-v1\0").update(token).digest("base64url");
}

function equalSecrets(received: string, expected: string): boolean {
    const receivedBytes = Buffer.from(received);
    const expectedBytes = Buffer.from(expected);
    return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

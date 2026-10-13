import { createHash, timingSafeEqual } from "node:crypto";
import {
    readProviderInvocationKeyId,
    verifyProviderInvocationToken,
    type ProviderInvocationClaims,
} from "@bernouy/cms-gateway/protocol";
import type { ProviderInstanceRecord, ProviderInstanceRegistry } from "@bernouy/ulvia-provider";
import type { InstanceCredential, InstanceCredentialStore } from "./InstanceCredentialStore";
import type { EncryptedInstanceCredentials } from "./EncryptedInstanceCredentials";

export type AuthenticatedInvocation = Readonly<{
    instance: ProviderInstanceRecord;
    claims: ProviderInvocationClaims;
}>;

export class ProviderInstanceAuthenticator {
    constructor(
        private readonly instances: ProviderInstanceRegistry,
        private readonly credentials: InstanceCredentialStore,
        private readonly encryptedCredentials: EncryptedInstanceCredentials,
    ) {}

    async authenticateControlToken(token: string): Promise<ProviderInstanceRecord | null> {
        const credential = await this.credentials.getByAccessTokenHash(hashInstanceAccessToken(token));
        if (!credential) {
            return null;
        }
        const secret = await this.readEnabledAccessToken(credential);
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
        const credential = await this.credentials.getByInvocationKeyId(keyId);
        if (!credential) {
            return null;
        }
        const secret = await this.readEnabledInvocationSecret(credential);
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

    async readEnabledAccessToken(credential: InstanceCredential): Promise<string | null> {
        if (!credential.enabled) {
            return null;
        }
        return (await this.encryptedCredentials.readSecret(credential.secretKey))?.instanceAccessToken ?? null;
    }

    async readEnabledInvocationSecret(credential: InstanceCredential): Promise<string | null> {
        if (!credential.enabled) {
            return null;
        }
        return (await this.encryptedCredentials.readSecret(credential.secretKey))?.invocationSecret ?? null;
    }

    private async readReadyInstance(instanceId: string): Promise<ProviderInstanceRecord | null> {
        const instance = await this.instances.get(instanceId);
        return instance?.status === "ready" ? instance : null;
    }
}

export function hashInstanceAccessToken(token: string): string {
    return createHash("sha256").update("ulvia-provider-instance-access-v1\0").update(token).digest("base64url");
}

function equalSecrets(received: string, expected: string): boolean {
    const receivedBytes = Buffer.from(received);
    const expectedBytes = Buffer.from(expected);
    return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

import { createHash, timingSafeEqual } from "node:crypto";
import {
    providerInvocationKeyId,
    readProviderInvocationKeyId,
    verifyProviderInvocationToken,
    type ProviderInvocationClaims,
} from "@bernouy/cms-gateway/protocol";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { InstanceAuthenticationReader } from "./material/InstanceAuthenticationReader";

export type AuthenticatedInvocation = Readonly<{
    instance: ProviderInstanceRecord;
    claims: ProviderInvocationClaims;
}>;

export class ProviderInstanceAuthenticator {
    constructor(private readonly authentication: InstanceAuthenticationReader) {}

    async authenticateControlToken(token: string): Promise<ProviderInstanceRecord | null> {
        const material = await this.authentication.read({
            field: "accessTokenHash",
            value: hashInstanceAccessToken(token),
        });
        return material && equalSecrets(token, material.secrets.instanceAccessToken) ? material.instance : null;
    }

    async authenticateReportToken(token: string): Promise<ProviderInstanceRecord | null> {
        const control = await this.authenticateControlToken(token);
        if (control) {
            return control;
        }
        try {
            const material = await this.authentication.read({
                field: "invocationKeyId",
                value: providerInvocationKeyId(token),
            });
            return material && equalSecrets(token, material.secrets.invocationSecret) ? material.instance : null;
        } catch {
            return null;
        }
    }

    async authenticateInvocationToken(token: string): Promise<AuthenticatedInvocation | null> {
        let keyId: string;
        try {
            keyId = readProviderInvocationKeyId(token);
        } catch {
            return null;
        }
        const material = await this.authentication.read({ field: "invocationKeyId", value: keyId });
        if (!material) {
            return null;
        }
        try {
            const claims = verifyProviderInvocationToken(token, material.secrets.invocationSecret);
            if (claims.instanceId !== material.instance.id) {
                return null;
            }
            return { instance: material.instance, claims };
        } catch {
            return null;
        }
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

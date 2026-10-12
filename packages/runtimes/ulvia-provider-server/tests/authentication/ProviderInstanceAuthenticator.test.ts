import { describe, expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { providerInvocationKeyId, signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInstanceRecord, ProviderInstanceRegistry } from "@bernouy/ulvia-provider";
import {
    ProviderInstanceAuthenticator,
    hashInstanceToken,
} from "../../src/runtime/authentication/ProviderInstanceAuthenticator";
import type {
    InstanceCredential,
    InstanceCredentialStore,
} from "../../src/runtime/authentication/InstanceCredentialStore";

const TOKEN = "opaque-instance-token-that-is-long-enough";
const INSTANCE_ID = "instance:alpha";

describe("ProviderInstanceAuthenticator", () => {
    test("resolves raw control and signed invocation credentials to one ready instance", async () => {
        const secrets = new InMemorySecretStore();
        await secrets.set("ULVIA_INSTANCE_ALPHA", TOKEN);
        const instance = readyInstance();
        const credential = instanceCredential();
        const authenticator = new ProviderInstanceAuthenticator(
            registry(instance),
            credentialStore(credential),
            secrets,
        );

        expect((await authenticator.authenticateControlToken(TOKEN))?.id).toBe(INSTANCE_ID);
        const issuedAt = Math.floor(Date.now() / 1_000);
        const signed = signProviderInvocationToken(TOKEN, {
            version: 1,
            requestId: "00000000-0000-4000-8000-000000000001",
            instanceId: INSTANCE_ID,
            contractId: "ulvia.cms.pages",
            contractVersion: "1.0.0",
            capabilityId: "list",
            issuedAt,
            expiresAt: issuedAt + 30,
        });
        expect((await authenticator.authenticateInvocationToken(signed))?.claims.instanceId).toBe(INSTANCE_ID);
    });

    test("rejects disabled instances and credentials from another instance", async () => {
        const secrets = new InMemorySecretStore();
        await secrets.set("ULVIA_INSTANCE_ALPHA", TOKEN);
        const disabled = { ...readyInstance(), status: "disabled" as const };
        const authenticator = new ProviderInstanceAuthenticator(
            registry(disabled),
            credentialStore(instanceCredential()),
            secrets,
        );
        expect(await authenticator.authenticateControlToken(TOKEN)).toBeNull();
    });
});

function readyInstance(): ProviderInstanceRecord {
    return {
        id: INSTANCE_ID,
        idempotencyKey: "create-alpha",
        idempotencyFingerprint: "fingerprint",
        storageKey: "alpha",
        kernelUrl: "http://127.0.0.1:5100",
        label: "Alpha",
        status: "ready",
        profile: { id: "ulvia.official", version: "1.0.0" },
        completedSteps: [],
        revision: 1,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    };
}

function instanceCredential(): InstanceCredential {
    return {
        instanceId: INSTANCE_ID,
        keyId: providerInvocationKeyId(TOKEN),
        tokenHash: hashInstanceToken(TOKEN),
        secretKey: "ULVIA_INSTANCE_ALPHA",
        enabled: true,
        revision: 1,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    };
}

function registry(instance: ProviderInstanceRecord): ProviderInstanceRegistry {
    return {
        init: async () => undefined,
        create: async () => instance,
        get: async (id) => (id === instance.id ? instance : null),
        getByIdempotencyKey: async () => null,
        list: async () => [instance],
        update: async () => instance,
    };
}

function credentialStore(credential: InstanceCredential): InstanceCredentialStore {
    return {
        init: async () => undefined,
        put: async () => credential,
        getByInstanceId: async (instanceId) => (instanceId === credential.instanceId ? credential : null),
        getByKeyId: async (keyId) => (keyId === credential.keyId ? credential : null),
        getByTokenHash: async (hash) => (hash === credential.tokenHash ? credential : null),
        disable: async () => undefined,
    };
}

import { expect, test } from "bun:test";
import { EncryptedInstanceCredentials } from "../../src/runtime/authentication/EncryptedInstanceCredentials";
import type {
    InstanceCredential,
    InstanceCredentialStore,
} from "../../src/runtime/authentication/InstanceCredentialStore";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { SecretStore } from "@bernouy/secret-store";

function fixture() {
    let credential: InstanceCredential | null = null;
    const values = new Map<string, string>();
    const secrets: SecretStore = {
        get: async (key) => values.get(key) ?? null,
        set: async (key, value) => {
            values.set(key, value);
        },
        delete: async (key) => {
            values.delete(key);
        },
        listKeys: async () => [...values.keys()],
    };
    const store: InstanceCredentialStore = {
        init: async () => undefined,
        put: async (input) => {
            if (credential) {
                throw new Error("duplicate key");
            }
            credential = {
                ...input,
                revision: 1,
                createdAt: new Date(0).toISOString(),
                updatedAt: new Date(0).toISOString(),
            };
            return credential;
        },
        getByInstanceId: async () => credential,
        getByInvocationKeyId: async () => credential,
        getByAccessTokenHash: async () => credential,
        disable: async () => {
            if (credential) {
                credential = { ...credential, enabled: false, revision: credential.revision + 1 };
            }
        },
    };
    const instance: ProviderInstanceRecord = {
        repository: { url: "https://repo.ulvia.fr", configured: false },

        id: "instance:concurrent",
        idempotencyKey: "create",
        idempotencyFingerprint: "fingerprint",
        creationAuthority: { kind: "operator" },
        storageKey: "storage",
        cmsUrl: "http://site.localhost",
        gatewayUrl: "http://site.localhost",
        label: "Site",
        status: "provisioning",
        revision: 1,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
    };
    return { instance, values, credentials: new EncryptedInstanceCredentials(store, secrets) };
}

test("concurrent credential initialization retains the winner and removes losing secrets", async () => {
    const f = fixture();
    const values = await Promise.all(Array.from({ length: 32 }, () => f.credentials.ensure(f.instance)));
    expect(new Set(values.map((value) => value.instanceAccessToken)).size).toBe(1);
    expect(new Set(values.map((value) => value.invocationSecret)).size).toBe(1);
    expect(f.values.size).toBe(1);
    expect(await f.credentials.read(f.instance.id)).toEqual(values[0]);
    expect(await f.credentials.ensure(f.instance)).toEqual(values[0]);
});

test("ensuring existing disabled credentials cannot reactivate or return their secret", async () => {
    const f = fixture();
    await f.credentials.ensure(f.instance);
    await f.credentials.disable(f.instance.id);
    const before = [...f.values.entries()];
    await expect(f.credentials.ensure(f.instance)).rejects.toThrow("disabled");
    expect(await f.credentials.read(f.instance.id)).toBeNull();
    expect([...f.values.entries()]).toEqual(before);
});

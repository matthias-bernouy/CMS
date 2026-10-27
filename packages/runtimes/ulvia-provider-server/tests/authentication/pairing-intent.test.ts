import { expect, test } from "bun:test";
import { secretKeyToRef } from "@bernouy/secret-store";
import { preparePairing, completePairing } from "../../src/runtime/gateway/providers/PairingIntent";
import type { PairingIntent } from "../../src/runtime/gateway/providers/PairingIntent";
import type { ProviderStores } from "../../src/runtime/stores/providerStores";
import type { StoredProviderInstallation } from "@bernouy/cms-repository/providers/installations";

function fixture() {
    const documents = new Map<string, PairingIntent>();
    const secrets = new Map<string, string>();
    const collection = {
        findOne: async ({ _id }: { _id: string }) => documents.get(_id) ?? null,
        insertOne: async (value: PairingIntent) => {
            if (documents.has(value._id)) {
                throw new Error("duplicate");
            }
            documents.set(value._id, structuredClone(value));
        },
        replaceOne: async (filter: PairingIntent, value: PairingIntent) => {
            const previous = documents.get(filter._id);
            const matchedCount = previous?.hash === filter.hash && previous.completed === filter.completed ? 1 : 0;
            if (matchedCount) {
                documents.set(value._id, structuredClone(value));
            }
            return { matchedCount };
        },
        updateOne: async (
            filter: { _id: string; hash?: string },
            update: { $set?: Partial<PairingIntent>; $setOnInsert?: PairingIntent },
        ) => {
            const previous = documents.get(filter._id);
            if (previous && (!filter.hash || filter.hash === previous.hash)) {
                Object.assign(previous, update.$set);
            } else if (!previous && update.$setOnInsert) {
                documents.set(filter._id, structuredClone(update.$setOnInsert));
            }
        },
    };
    const stores = {
        db: { collection: () => collection },
        contractSecrets: {
            installations: {
                get: async (key: string) => secrets.get(key),
                set: async (key: string, token: string) => {
                    secrets.set(key, token);
                },
                delete: async (key: string) => {
                    secrets.delete(key);
                },
            },
        },
    } as unknown as ProviderStores;
    const source = {
        revision: 2,
        installation: { id: "source", status: "enabled", approval: { manifestDigest: "approved-digest" } },
    } as StoredProviderInstallation;
    const input = { installationId: "source", expectedRevision: 2, rotate: true };
    return { stores, source, input, secrets };
}

test("pairing retries reuse one encrypted credential across observation revisions and reject changed authority", async () => {
    const f = fixture();
    const first = await preparePairing(f.stores, f.source, f.input, "admin");
    const observed = { ...f.source, revision: 3 };
    expect((await preparePairing(f.stores, observed, { ...f.input, expectedRevision: 3 }, "admin")).key).toBe(
        first.key,
    );
    expect(f.secrets.size).toBe(1);
    await expect(preparePairing(f.stores, observed, f.input, "another-admin")).rejects.toMatchObject({ status: 409 });
    const changed = { ...observed, installation: { ...observed.installation, status: "revoked" as const } };
    await expect(preparePairing(f.stores, changed, { ...f.input, expectedRevision: 3 }, "admin")).rejects.toMatchObject(
        { status: 409 },
    );
});

test("completed approval receipts survive subsequent rotations and cannot restore old authority", async () => {
    const f = fixture();
    const first = await preparePairing(f.stores, f.source, f.input, "admin", "ticket");
    const installed = {
        ...f.source,
        revision: 4,
        installation: { ...f.source.installation, gatewayTokenRef: secretKeyToRef(first.key) },
    };
    await completePairing(f.stores, "source", installed.installation.gatewayTokenRef);
    expect(
        (await preparePairing(f.stores, installed, { ...f.input, expectedRevision: 4 }, "admin", "ticket")).key,
    ).toBe(first.key);
    const next = await preparePairing(f.stores, installed, { ...f.input, expectedRevision: 4 }, "admin");
    expect(next.key).not.toBe(first.key);
    const rotated = {
        ...installed,
        revision: 6,
        installation: { ...installed.installation, gatewayTokenRef: secretKeyToRef(next.key) },
    };
    await completePairing(f.stores, "source", rotated.installation.gatewayTokenRef);
    await expect(
        preparePairing(f.stores, rotated, { ...f.input, expectedRevision: 6 }, "admin", "ticket"),
    ).rejects.toMatchObject({ status: 409 });
});

test("a fresh approved configuration can supersede a stranded older pairing without restoring its key", async () => {
    const f = fixture();
    const first = await preparePairing(f.stores, f.source, f.input, "admin");
    const changed = {
        ...f.source,
        revision: 3,
        installation: { ...f.source.installation, endpoint: "https://new.example" },
    };
    const next = await preparePairing(f.stores, changed, { ...f.input, expectedRevision: 3 }, "admin");
    expect(next.key).not.toBe(first.key);
    expect(next.expectedRevision).toBe(3);
    expect(f.secrets.has(first.key)).toBe(false);
});

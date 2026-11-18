import { expect, test } from "bun:test";
import { CmsSecrets } from "@bernouy/secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { secretReadDataset, SECRET_KEY_HISTORY, SECRET_READ_VOLUME } from "./dataset";
import { assertSecretMetadataList } from "./oracles";
import { requireRecord } from "../../queries/types";
import type { SecretNamespaceKeyRecord } from "@bernouy/secrets";
import type { SecretState } from "./dataset";

class TrackedStore extends InMemoryCmsSecretMetadataStore {
    readonly keys = new Set<string>();
    override async putNamespaceKey(key: SecretNamespaceKeyRecord) {
        this.keys.add(key.id);
        await super.putNamespaceKey(key);
    }
}

test("secret volume and history fixtures use real domain writes, preserve bounded live records and retain actual revoked keys", async () => {
    for (const history of [false, true]) {
        const store = new TrackedStore();
        const service = new CmsSecrets(store, new InMemorySecretStore());
        const credentials = await service.createNamespace({
            name: "performance-dataset",
            createdBy: { kind: "administrator", id: "fixture" },
        });
        const secret = requireRecord(
            await service.create(
                credentials.namespaceId,
                credentials.namespaceKey,
                "performance-first",
                "private-value",
            ),
        );
        const state: SecretState = {
            credentials,
            secret,
            async fixture(capability, input) {
                const namespaceId = String(input.namespaceId);
                const namespaceKey = String(input.namespaceKey);
                if (capability === "secrets.create") {
                    return service.create(namespaceId, namespaceKey, String(input.name), String(input.value));
                }
                if (capability === "namespace.keys.create") {
                    return service.createNamespaceKey({
                        namespaceId,
                        namespaceKey,
                        permissions: ["namespace.manage", "secrets.metadata.read", "secrets.resolve"],
                    });
                }
                if (capability === "namespace.keys.rotate") {
                    return service.rotateNamespaceKey(namespaceId, namespaceKey, String(input.keyId));
                }
                if (capability === "secrets.rotate") {
                    return service.rotate(
                        namespaceId,
                        namespaceKey,
                        String(input.secretId),
                        Number(input.expectedVersion),
                        String(input.value),
                    );
                }
                throw new Error("Unexpected fixture command");
            },
        };
        const data = await secretReadDataset(state, history);
        const read = (limit: number) =>
            service.list(String(data.credentials.namespaceId), String(data.credentials.namespaceKey), limit);
        expect(data.records).toHaveLength(SECRET_READ_VOLUME);
        assertSecretMetadataList({ items: await read(25) }, data.records, 25);
        assertSecretMetadataList({ items: await read(100) }, data.records, 100);
        const keys = await Promise.all([...store.keys].map((id) => store.getNamespaceKey(id)));
        expect(keys.filter((key) => key?.revokedAt)).toHaveLength(history ? SECRET_KEY_HISTORY : 0);
        expect(keys.filter((key) => key && !key.revokedAt)).toHaveLength(1);
        expect(data.records[0]!.version).toBe(history ? 9 : 1);
        if (history) {
            await expect(service.list(credentials.namespaceId, String(data.revokedKey), 25)).rejects.toThrow();
        }
        await service.deleteNamespace(credentials.namespaceId, credentials.namespaceKey);
        expect(await store.getNamespace(credentials.namespaceId)).toBeNull();
        expect(await store.list(credentials.namespaceId, 100)).toEqual([]);
        expect(
            (await Promise.all([...store.keys].map((id) => store.getNamespaceKey(id)))).every((key) => key === null),
        ).toBe(true);
    }
});

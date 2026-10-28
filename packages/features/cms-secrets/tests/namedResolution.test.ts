import { expect, test } from "bun:test";
import { CmsSecrets, CmsSecretNamespaceStore } from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";

class CountedMetadata extends InMemoryCmsSecretMetadataStore {
    reads = { key: 0, name: 0, id: 0 };
    override getNamespaceKey(id: string) {
        this.reads.key++;
        return super.getNamespaceKey(id);
    }
    override findByName(namespaceId: string, name: string) {
        this.reads.name++;
        return super.findByName(namespaceId, name);
    }
    override get(id: string) {
        this.reads.id++;
        return super.get(id);
    }
}
class CountedValues extends InMemorySecretStore {
    reads = 0;
    override get(key: string) {
        this.reads++;
        return super.get(key);
    }
}

test("named resolution uses three reads, requires both permissions and reloads rotations and revocations", async () => {
    const metadata = new CountedMetadata();
    const values = new CountedValues();
    const secrets = new CmsSecrets(metadata, values);
    const owner = await secrets.createNamespace({ name: "instance-a", createdBy: { kind: "system", id: "test" } });
    const other = await secrets.createNamespace({ name: "instance-b", createdBy: { kind: "system", id: "test" } });
    const secret = await secrets.create(owner.namespaceId, owner.namespaceKey, "TOKEN", "initial");
    const read = async (key = owner.namespaceKey, namespaceId = owner.namespaceId) =>
        new CmsSecretNamespaceStore(secrets, { namespaceId, namespaceKey: key }).get("TOKEN");
    metadata.reads = { key: 0, name: 0, id: 0 };
    values.reads = 0;
    expect(await read()).toBe("initial");
    expect(metadata.reads).toEqual({ key: 1, name: 1, id: 0 });
    expect(values.reads).toBe(1);
    for (const permission of ["secrets.metadata.read", "secrets.resolve"] as const) {
        const key = await secrets.createNamespaceKey({
            namespaceId: owner.namespaceId,
            namespaceKey: owner.namespaceKey,
            permissions: [permission],
        });
        const before = values.reads;
        await expect(read(key.namespaceKey)).rejects.toThrow();
        expect(values.reads).toBe(before);
    }
    await expect(read(owner.namespaceKey, other.namespaceId)).rejects.toThrow();
    const findByName = metadata.findByName.bind(metadata);
    metadata.findByName = async (namespaceId, name) => {
        const record = await findByName(namespaceId, name);
        return record ? { ...record, namespaceId: other.namespaceId } : null;
    };
    const beforeForeignRead = values.reads;
    await expect(read()).rejects.toThrow("does not exist");
    expect(values.reads).toBe(beforeForeignRead);
    metadata.findByName = findByName;

    await secrets.rotate(owner.namespaceId, owner.namespaceKey, secret.secretId, 1, "rotated");
    expect(await read()).toBe("rotated");
    const replacement = await secrets.rotateNamespaceKey(owner.namespaceId, owner.namespaceKey, owner.keyId);
    await expect(read()).rejects.toThrow();
    expect(await read(replacement.namespaceKey)).toBe("rotated");
    await secrets.revokeNamespaceKey(owner.namespaceId, replacement.namespaceKey, replacement.keyId);
    await expect(read(replacement.namespaceKey)).rejects.toThrow();
});

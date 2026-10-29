import { CmsSecrets, type CmsSecretResolutionReader } from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";

type Prepared = Awaited<ReturnType<CmsSecretResolutionReader["read"]>>;

export async function joinedFixture() {
    const metadata = new InMemoryCmsSecretMetadataStore();
    const values = new InMemorySecretStore();
    const stats = { captures: 0, plaintextReads: 0 };
    let now = new Date("2026-10-29T10:00:00Z");
    let rewrite = (value: Prepared) => value;
    let failure: Error | undefined;
    const reader: CmsSecretResolutionReader = {
        read: async (input) => {
            stats.captures++;
            if (failure) {
                throw failure;
            }
            const key = await metadata.getNamespaceKey(input.keyId);
            const secret = await metadata.findByName(input.namespaceId, input.name);
            return rewrite({
                key,
                metadata: secret,
                resolveValue: async () => {
                    stats.plaintextReads++;
                    return secret ? values.get(secret.storageKey) : null;
                },
            });
        },
    };
    const secrets = new CmsSecrets(metadata, values, { resolutionReader: reader, now: () => now });
    const owner = await secrets.createNamespace({ name: "owner", createdBy: { kind: "system", id: "test" } });
    const other = await secrets.createNamespace({ name: "other", createdBy: { kind: "system", id: "test" } });
    const secret = await secrets.create(owner.namespaceId, owner.namespaceKey, "TOKEN", "initial");
    return {
        metadata,
        values,
        stats,
        secrets,
        owner,
        other,
        secret,
        read: (namespaceKey = owner.namespaceKey, namespaceId = owner.namespaceId, name = "TOKEN") =>
            secrets.resolveByName(namespaceId, namespaceKey, name),
        set rewrite(value: typeof rewrite) {
            rewrite = value;
        },
        set failure(value: Error | undefined) {
            failure = value;
        },
        set now(value: Date) {
            now = value;
        },
    };
}

import {
    assertRepositoryNamespace,
    type RepositoryNamespaceClient,
} from "@bernouy/cms-repository/repository/namespaces";
import {
    NamespaceAccessError,
    type NamespaceAccess,
    type NamespaceInventoryQuery,
} from "@bernouy/cms-repository/repository/authoring";
import type { Db } from "mongodb";

/** Remembered names are discovery data; only the live owner record grants access. */
export class NamespaceInventory {
    private readonly collection;
    constructor(db: Db) {
        this.collection = db.collection<{ _id: string; repositoryId: string }>("cms_repository_namespaces");
    }
    async remember(namespace: string, repositoryId: string) {
        assertRepositoryNamespace(namespace);
        await this.collection.updateOne({ _id: namespace }, { $set: { repositoryId } }, { upsert: true });
    }
    async list(
        repositoryId: string,
        publicKey: string,
        client: RepositoryNamespaceClient,
        input: NamespaceInventoryQuery,
    ) {
        const limit = input.limit ?? 25;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw new NamespaceAccessError("Invalid namespace page limit");
        }
        if (input.cursor) {
            assertRepositoryNamespace(input.cursor);
        }
        if (input.namespace) {
            assertRepositoryNamespace(input.namespace);
        }
        const records = await this.collection
            .find({
                repositoryId,
                ...(input.namespace ? { _id: input.namespace } : input.cursor ? { _id: { $gt: input.cursor } } : {}),
            })
            .sort({ _id: 1 })
            .limit(limit + 1)
            .toArray();
        const page = records.slice(0, limit);
        const items: NamespaceAccess[] = [];
        // Keep Repository requests bounded while checking every page entry live.
        for (let offset = 0; offset < page.length; offset += 8) {
            items.push(
                ...(await Promise.all(
                    page.slice(offset, offset + 8).map(async (record) => {
                        const owner = await client.get(record._id);
                        return {
                            namespace: record._id,
                            repositoryId,
                            access: !owner
                                ? ("missing" as const)
                                : owner.revoked
                                  ? ("revoked" as const)
                                  : owner.publicKey === publicKey
                                    ? ("owned" as const)
                                    : ("transferred" as const),
                            revision: owner?.revision ?? null,
                            publicKey: owner?.publicKey ?? null,
                            checkedAt: new Date().toISOString(),
                        };
                    }),
                )),
            );
        }
        return { items, nextCursor: records.length > limit ? page.at(-1)!._id : null };
    }
}

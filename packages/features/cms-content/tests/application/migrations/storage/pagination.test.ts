import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import {
    InMemoryCmsRepository,
    ValidatingCmsRepository,
    withInstalledCollections,
    type CmsRepository,
} from "@bernouy/cms-content";
import { CollectionMigrationService, MemoryCollectionMigrationStorage } from "@bernouy/cms-content/migrations";

test("plans, executes, verifies, and rolls back through bounded page cursors", async () => {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const previous = await collections.importRelease(release("1.0.0", "atlas-card"));
    const next = await collections.importRelease({
        ...release("2.0.0", "atlas-panel"),
        dataGeneration: 2,
        migrations: [
            {
                fromGeneration: 1,
                toGeneration: 2,
                operations: [{ kind: "rename-bloc", from: "atlas-card", to: "atlas-panel" }],
            },
        ],
    });
    await collections.install("site", previous.digest, 0);
    const inner = new ValidatingCmsRepository(
        withInstalledCollections(new InMemoryCmsRepository(), collections, "site"),
    );
    for (let index = 0; index < 45; index += 1) {
        await inner.insertPage(`/page-${index}`, `Page ${index}`, "<atlas-card></atlas-card>");
    }
    let scans = 0;
    let largestBatch = 0;
    const repository = new Proxy(inner, {
        get(target, property) {
            if (property === "getAllPages") {
                return async () => {
                    throw new Error("unbounded page read used");
                };
            }
            if (property === "scanPages") {
                return async (cursor: string | undefined, limit: number) => {
                    scans += 1;
                    const batch = await target.scanPages(cursor, Math.min(limit, 7));
                    largestBatch = Math.max(largestBatch, batch.pages.length);
                    return batch;
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as CmsRepository;
    const service = new CollectionMigrationService(repository, collections, new MemoryCollectionMigrationStorage());

    const plan = await service.plan("site", [{ digest: next.digest }], 1);
    expect(plan.pages).toHaveLength(45);
    const completed = await service.execute("site", [{ digest: next.digest }], 1, plan.planDigest);
    expect(completed.status).toBe("completed");
    expect(await repository.getPage("/page-20")).toMatchObject({ content: "<atlas-panel></atlas-panel>" });
    const rolledBack = await service.rollback("site", completed.id);
    expect(rolledBack.status).toBe("rolled-back");
    expect(await repository.getPage("/page-20")).toMatchObject({ content: "<atlas-card></atlas-card>" });
    expect(scans).toBeGreaterThan(20);
    expect(largestBatch).toBe(7);
});

function release(version: string, blocId: string): Record<string, unknown> {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "atlas",
        publisherId: "atlas.official",
        version,
        name: "collection.name",
        locale: "en",
        translations: { en: { "collection.name": "Atlas", "bloc.label": "Card" } },
        assets: [],
        blocs: [
            {
                kind: "component",
                id: blocId,
                label: "bloc.label",
                shadowdom: "<div></div>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
    };
}

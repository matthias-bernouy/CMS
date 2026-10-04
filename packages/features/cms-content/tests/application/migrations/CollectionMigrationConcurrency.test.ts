import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryCmsRepository, ValidatingCmsRepository, withInstalledCollections } from "@bernouy/cms-content";
import { CollectionMigrationService, MemoryCollectionMigrationStorage } from "@bernouy/cms-content/migrations";

test("allows exactly one concurrent migration to commit in memory", async () => {
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
    const repository = new ValidatingCmsRepository(
        withInstalledCollections(new InMemoryCmsRepository(), collections, "site"),
    );
    await repository.insertPage("/demo", "Demo", "<atlas-card></atlas-card>");
    const storage = new MemoryCollectionMigrationStorage();
    const service = new CollectionMigrationService(repository, collections, storage);

    const attempts = await Promise.allSettled([
        service.execute("site", [{ digest: next.digest }], 1),
        service.execute("site", [{ digest: next.digest }], 1),
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await storage.getActive("site")).toBeNull();
    expect((await collections.snapshot("site")).collections[0]!.digest).toBe(next.digest);
    expect(await repository.getPage("/demo")).toMatchObject({
        revision: 2,
        content: "<atlas-panel></atlas-panel>",
    });
});

test("cancels a plan that acquires the journal only after another migration completed", async () => {
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
    const repository = new ValidatingCmsRepository(
        withInstalledCollections(new InMemoryCmsRepository(), collections, "site"),
    );
    await repository.insertPage("/demo", "Demo", "<atlas-card></atlas-card>");
    const storage = new MemoryCollectionMigrationStorage();
    let createCount = 0;
    let releaseDelayed!: () => void;
    let announceDelayed!: () => void;
    const delayedWaiting = new Promise<void>((resolve) => {
        announceDelayed = resolve;
    });
    let delayedId = "";
    const delayed = new Proxy(storage, {
        get(target, property) {
            if (property === "create") {
                return async (record: Parameters<typeof target.create>[0]) => {
                    createCount += 1;
                    if (createCount === 2) {
                        delayedId = record.id;
                        await new Promise<void>((resolve) => {
                            releaseDelayed = resolve;
                            announceDelayed();
                        });
                    }
                    return target.create(record);
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    const service = new CollectionMigrationService(repository, collections, delayed);
    const attempts = [
        service.execute("site", [{ digest: next.digest }], 1),
        service.execute("site", [{ digest: next.digest }], 1),
    ];
    await delayedWaiting;
    const completed = await Promise.race(attempts.map((attempt) => attempt.catch(() => null)));
    expect(completed).toMatchObject({ status: "completed" });

    releaseDelayed();
    const settled = await Promise.allSettled(attempts);
    expect(settled.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await storage.get(delayedId)).toMatchObject({ status: "rolled-back" });
    expect(await storage.getActive("site")).toBeNull();
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
        translations: { en: { "collection.name": "Atlas", "bloc.label": "Bloc" } },
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

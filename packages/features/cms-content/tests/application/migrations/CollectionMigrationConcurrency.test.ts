import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryCmsRepository, ValidatingCmsRepository, withInstalledCollections } from "@bernouy/cms-content";
import {
    CollectionMigrationService,
    MemoryCollectionMigrationStorage,
    withCollectionMigrationWriteFence,
} from "@bernouy/cms-content/migrations";
import type { CmsRepository } from "@bernouy/cms-content";

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
    let claimCount = 0;
    let createCount = 0;
    let releaseDelayed!: () => void;
    let announceDelayed!: () => void;
    const delayedWaiting = new Promise<void>((resolve) => {
        announceDelayed = resolve;
    });
    let delayedId = "";
    const delayed = new Proxy(storage, {
        get(target, property) {
            if (property === "claimMaintenance") {
                return async (...args: Parameters<typeof target.claimMaintenance>) => {
                    claimCount += 1;
                    if (claimCount === 2) {
                        await new Promise<void>((resolve) => {
                            releaseDelayed = resolve;
                            announceDelayed();
                        });
                    }
                    return target.claimMaintenance(...args);
                };
            }
            if (property === "create") {
                return async (record: Parameters<typeof target.create>[0]) => {
                    createCount += 1;
                    if (createCount === 2) {
                        delayedId = record.id;
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

test("drains an in-flight write before validating the migration snapshot", async () => {
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
    const page = (await repository.getPage("/demo"))!;
    let releaseWrite!: () => void;
    let announceWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
        announceWrite = resolve;
    });
    const delayed = new Proxy(repository, {
        get(target, property) {
            if (property === "updatePage") {
                return async (...args: Parameters<CmsRepository["updatePage"]>) => {
                    announceWrite();
                    await new Promise<void>((resolve) => {
                        releaseWrite = resolve;
                    });
                    return target.updatePage(...args);
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as CmsRepository;
    const storage = new MemoryCollectionMigrationStorage();
    const guarded = withCollectionMigrationWriteFence(delayed, storage, "site", ["updatePage"]);
    const userWrite = guarded.updatePage({ id: page.id, title: "Concurrent edit" }, page.revision);
    await writeStarted;
    const service = new CollectionMigrationService(delayed, collections, storage);
    const migration = service.execute("site", [{ digest: next.digest }], 1);
    let maintenanceObserved = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            await storage.withWrite("site", async () => undefined);
            await new Promise((resolve) => setTimeout(resolve, 1));
        } catch (error) {
            expect(error).toMatchObject({ status: 423 });
            maintenanceObserved = true;
            break;
        }
    }
    expect(maintenanceObserved).toBe(true);
    releaseWrite();
    await userWrite;

    await expect(migration).rejects.toMatchObject({ status: 409 });
    expect((await collections.snapshot("site")).collections[0]!.digest).toBe(previous.digest);
    expect(await repository.getPage("/demo")).toMatchObject({ title: "Concurrent edit", revision: 2 });
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

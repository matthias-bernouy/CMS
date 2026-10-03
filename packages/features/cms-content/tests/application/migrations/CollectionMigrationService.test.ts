import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import {
    InMemoryCmsRepository,
    ValidatingCmsRepository,
    withInstalledCollections,
    type CmsRepository,
} from "@bernouy/cms-content";
import { CollectionMigrationService, MemoryCollectionMigrationStorage } from "@bernouy/cms-content/migrations";
import { MongoCollectionMigrationStorage } from "@bernouy/cms-content/mongo";
import type { Db } from "mongodb";
import { FakeContentDb } from "../mongo/contentMongoFixture";

test("migrates a renamed bloc under maintenance and rolls it back without rewinding page revisions", async () => {
    const fixture = await migrationFixture();
    const plan = await fixture.service.plan("site", [{ digest: fixture.next.digest, repositoryId: "local" }], 1);
    expect(plan.blockedReasons).toEqual([]);
    expect(plan.pages).toEqual([{ id: fixture.page.id, path: "/demo", revision: 1, operations: 1 }]);
    expect(plan.resources).toContainEqual(
        expect.objectContaining({ kind: "bloc", id: "atlas-card", change: "removed" }),
    );

    const completed = await fixture.service.execute(
        "site",
        [{ digest: fixture.next.digest, repositoryId: "local" }],
        1,
    );
    expect(completed.status).toBe("completed");
    expect(await fixture.storage.getActive("site")).toBeNull();
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).toBe(fixture.next.digest);
    expect(await fixture.repository.getPageById(fixture.page.id)).toMatchObject({
        revision: 2,
        content: "<atlas-panel></atlas-panel>",
    });

    const rolledBack = await fixture.service.rollback("site", completed.id);
    expect(rolledBack.status).toBe("rolled-back");
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).toBe(fixture.previous.digest);
    expect(await fixture.repository.getPageById(fixture.page.id)).toMatchObject({
        revision: 3,
        content: "<atlas-card></atlas-card>",
    });
});

test("keeps maintenance active after a failed content write and can recover by rollback", async () => {
    const fixture = await migrationFixture();
    let rejectMigrationWrite = true;
    const failing = new Proxy(fixture.repository, {
        get(target, property) {
            if (property === "updatePage" && rejectMigrationWrite) {
                return async () => {
                    throw new Error("simulated page write failure");
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as CmsRepository;
    const service = new CollectionMigrationService(failing, fixture.collections, fixture.storage);
    await expect(service.execute("site", [{ digest: fixture.next.digest, repositoryId: "local" }], 1)).rejects.toThrow(
        "simulated page write failure",
    );
    const active = await fixture.storage.getActive("site");
    expect(active).toMatchObject({ status: "failed" });
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).toBe(fixture.next.digest);

    rejectMigrationWrite = false;
    const rolledBack = await service.rollback("site", active!.id);
    expect(rolledBack.status).toBe("rolled-back");
    expect(await fixture.storage.getActive("site")).toBeNull();
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).toBe(fixture.previous.digest);
});

test("resumes a partially committed forward migration without reacquiring the initial snapshot", async () => {
    const fixture = await migrationFixture();
    let rejectMigrationWrite = true;
    const interrupted = new Proxy(fixture.repository, {
        get(target, property) {
            if (property === "updatePage" && rejectMigrationWrite) {
                return async () => {
                    rejectMigrationWrite = false;
                    throw new Error("simulated page write interruption");
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as CmsRepository;
    const service = new CollectionMigrationService(interrupted, fixture.collections, fixture.storage);

    await expect(service.execute("site", [{ digest: fixture.next.digest }], 1)).rejects.toThrow(
        "simulated page write interruption",
    );
    const active = await fixture.storage.getActive("site");
    const completed = await service.resume("site", active!.id);

    expect(completed.status).toBe("completed");
    expect(await fixture.repository.getPageById(fixture.page.id)).toMatchObject({
        revision: 2,
        content: "<atlas-panel></atlas-panel>",
    });
});

test("blocks a removed bloc only while stored pages still reference it", async () => {
    const fixture = await migrationFixture();
    const target = await fixture.collections.importRelease({
        ...release("2.1.0", "atlas-panel"),
        dataGeneration: 2,
        migrations: [{ fromGeneration: 1, toGeneration: 2, operations: [] }],
    });
    const blocked = await fixture.service.plan("site", [{ digest: target.digest }], 1);
    expect(blocked.blockedReasons).toContainEqual(expect.stringContaining("Page /demo is incompatible"));

    await fixture.repository.updatePage({ id: fixture.page.id, content: "" }, fixture.page.revision);
    const safe = await fixture.service.plan("site", [{ digest: target.digest }], 1);
    expect(safe.blockedReasons).toEqual([]);
    expect(safe.pages).toEqual([]);
});

test("stores page snapshots separately and reconstructs transformed content from its digest", async () => {
    const fixture = await migrationFixture();
    const db = new FakeContentDb();
    const storage = new MongoCollectionMigrationStorage(db as unknown as Db);
    await storage.init();
    const service = new CollectionMigrationService(fixture.repository, fixture.collections, storage);
    const completed = await service.execute("site", [{ digest: fixture.next.digest }], 1);
    const main = (await db.get("collection_migrations").find().toArray())[0]!;
    const page = (await db.get("collection_migration_pages").find().toArray())[0]!;

    expect(main.pages).toBeUndefined();
    expect(main.pageCount).toBe(1);
    expect(page.afterContent).toBeUndefined();
    expect(page.afterContentDigest).toMatch(/^sha256:/);
    expect(await storage.get(completed.id)).toMatchObject({
        pages: [{ afterContent: "<atlas-panel></atlas-panel>", state: "applied" }],
    });
});

test("resumes rollback when the page write succeeded before its journal update", async () => {
    const fixture = await migrationFixture();
    const completed = await fixture.service.execute("site", [{ digest: fixture.next.digest }], 1);
    let rejectJournalWrite = true;
    const interruptedStorage = new Proxy(fixture.storage, {
        get(target, property) {
            if (property === "replacePage" && rejectJournalWrite) {
                return async () => {
                    rejectJournalWrite = false;
                    throw new Error("simulated journal interruption");
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    const service = new CollectionMigrationService(fixture.repository, fixture.collections, interruptedStorage);
    await expect(service.rollback("site", completed.id)).rejects.toThrow("simulated journal interruption");
    expect(await fixture.repository.getPageById(fixture.page.id)).toMatchObject({
        revision: 3,
        content: "<atlas-card></atlas-card>",
    });

    const rolledBack = await service.resume("site", completed.id);
    expect(rolledBack.status).toBe("rolled-back");
    expect(rolledBack.pages[0]).toMatchObject({ state: "rolled-back", rolledBackRevision: 3 });
});

test("cancels cleanly when a page changes before maintenance owns the snapshot", async () => {
    const fixture = await migrationFixture();
    let migrationId = "";
    const racingStorage = new Proxy(fixture.storage, {
        get(target, property) {
            if (property === "create") {
                return async (record: Parameters<typeof target.create>[0]) => {
                    const created = await target.create(record);
                    migrationId = record.id;
                    await fixture.repository.updatePage(
                        { id: fixture.page.id, title: "Changed concurrently" },
                        fixture.page.revision,
                    );
                    return created;
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    const service = new CollectionMigrationService(fixture.repository, fixture.collections, racingStorage);

    await expect(service.execute("site", [{ digest: fixture.next.digest }], 1)).rejects.toMatchObject({ status: 409 });
    expect(await racingStorage.getActive("site")).toBeNull();
    expect(await racingStorage.get(migrationId)).toMatchObject({ status: "rolled-back" });
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).toBe(fixture.previous.digest);
    expect(await fixture.repository.getPageById(fixture.page.id)).toMatchObject({
        title: "Changed concurrently",
        revision: 2,
    });
});

test("migrates collection configuration through declarative value operations", async () => {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const previous = await collections.importRelease({
        ...release("1.0.0", "atlas-card"),
        configuration: {
            schema: {
                type: "object",
                properties: {
                    mode: { type: "string", maxLength: 20, enum: ["legacy"] },
                    legacy: { type: "string", maxLength: 20 },
                },
                required: ["mode", "legacy"],
            },
            defaults: { mode: "legacy", legacy: "remove-me" },
        },
    });
    const next = await collections.importRelease({
        ...release("2.0.0", "atlas-card"),
        dataGeneration: 2,
        configuration: {
            generation: 2,
            schema: {
                type: "object",
                properties: {
                    mode: { type: "string", maxLength: 20, enum: ["modern"] },
                    density: { type: "string", maxLength: 20, enum: ["compact"] },
                },
                required: ["mode", "density"],
            },
            defaults: { mode: "modern", density: "compact" },
        },
        migrations: [
            {
                fromGeneration: 1,
                toGeneration: 2,
                operations: [
                    {
                        kind: "map-configuration-value",
                        path: ["mode"],
                        values: [{ from: "legacy", to: "modern" }],
                    },
                    { kind: "remove-configuration-value", path: ["legacy"] },
                    { kind: "set-configuration-default", path: ["density"], value: "compact" },
                ],
            },
        ],
    });
    await collections.install("site", previous.digest, 0);
    const repository = new ValidatingCmsRepository(
        withInstalledCollections(new InMemoryCmsRepository(), collections, "site"),
    );
    const service = new CollectionMigrationService(repository, collections, new MemoryCollectionMigrationStorage());

    await service.execute("site", [{ digest: next.digest }], 1);
    expect((await collections.snapshot("site")).collections[0]?.configuration).toEqual({
        mode: "modern",
        density: "compact",
    });
});

async function migrationFixture() {
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
    await collections.install("site", previous.digest, 0, "local");
    const inner = new InMemoryCmsRepository();
    const repository = new ValidatingCmsRepository(withInstalledCollections(inner, collections, "site"));
    await repository.insertPage("/demo", "Demo", "<atlas-card></atlas-card>");
    const page = (await repository.getPage("/demo"))!;
    const storage = new MemoryCollectionMigrationStorage();
    return {
        collections,
        previous,
        next,
        repository,
        page,
        storage,
        service: new CollectionMigrationService(repository, collections, storage),
    };
}

function release(version: string, id: string): Record<string, unknown> {
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
                id,
                label: "bloc.label",
                shadowdom: "<div></div>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
    };
}

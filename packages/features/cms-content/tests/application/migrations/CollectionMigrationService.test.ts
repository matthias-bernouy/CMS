import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { parseCollectionRelease } from "@bernouy/cms-repository/collections";
import {
    InMemoryCmsRepository,
    ValidatingCmsRepository,
    withInstalledCollections,
    type CmsRepository,
} from "@bernouy/cms-content";
import { CollectionMigrationService, MemoryCollectionMigrationStorage } from "@bernouy/cms-content/migrations";
import { MongoCollectionMigrationStorage } from "@bernouy/cms-content/mongo";
import { dependencyIssues } from "cms-content/application/migrations/planning/evolution";
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

test("migrates an installed collection asset reference and restores it on rollback", async () => {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const oldBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><title>Old</title></svg>');
    const newBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><title>New</title></svg>');
    const previous = await collections.importRelease(
        { ...release("1.0.0", "atlas-card"), assets: [asset("old.svg", oldBytes)] },
        [{ id: "old.svg", bytes: oldBytes }],
    );
    const next = await collections.importRelease(
        {
            ...release("2.0.0", "atlas-card"),
            dataGeneration: 2,
            assets: [asset("new.svg", newBytes)],
            migrations: [
                {
                    fromGeneration: 1,
                    toGeneration: 2,
                    operations: [{ kind: "rename-asset", from: "old.svg", to: "new.svg" }],
                },
            ],
        },
        [{ id: "new.svg", bytes: newBytes }],
    );
    await collections.install("site", previous.digest, 0, "local");
    const repository = new ValidatingCmsRepository(
        withInstalledCollections(new InMemoryCmsRepository(), collections, "site"),
    );
    await repository.insertPage("/asset", "Asset", '<img src="{{ cms.asset.atlas.old.svg }}" alt="Asset">');
    const inserted = (await repository.getPage("/asset"))!;
    const storage = new MemoryCollectionMigrationStorage();
    const service = new CollectionMigrationService(repository, collections, storage);

    const plan = await service.plan("site", [{ digest: next.digest, repositoryId: "local" }], 1);
    expect(plan.blockedReasons).toEqual([]);
    expect(plan.resources).toContainEqual(expect.objectContaining({ kind: "asset", id: "old.svg" }));
    const completed = await service.execute("site", [{ digest: next.digest, repositoryId: "local" }], 1);
    expect(await repository.getPageById(inserted.id)).toMatchObject({
        content: '<img src="{{ cms.asset.atlas.new.svg }}" alt="Asset">',
        revision: 2,
    });
    expect(await collections.getReleaseAsset(next.digest, "new.svg")).toEqual(newBytes);

    await service.rollback("site", completed.id);
    expect(await repository.getPageById(inserted.id)).toMatchObject({
        content: '<img src="{{ cms.asset.atlas.old.svg }}" alt="Asset">',
        revision: 3,
    });
    expect(await collections.getReleaseAsset(previous.digest, "old.svg")).toEqual(oldBytes);
});

test("reports removed imported texts and assets before a migration acquires maintenance", () => {
    const bytes = new TextEncoder().encode("asset");
    const provider = parseCollectionRelease({
        ...release("1.0.0", "atlas-card"),
        texts: [{ id: "title", values: { en: "Title" } }],
        assets: [asset("logo.svg", bytes)],
        exports: { blocs: [], themeTokens: [], texts: ["title"], assets: ["logo.svg"] },
    });
    const consumer = parseCollectionRelease({
        ...release("1.0.0", "atlas-card"),
        collectionId: "storefront",
        publisherId: "storefront.official",
        blocs: [],
        dependencies: [
            {
                collectionId: "atlas",
                publisherId: "atlas.official",
                versionRange: "^2.0.0",
                imports: {
                    blocs: [],
                    themeTokens: [],
                    texts: [{ id: "title", generation: 1 }],
                    assets: [{ id: "logo.svg", generation: 1 }],
                },
            },
        ],
    });
    const target = parseCollectionRelease({
        ...release("2.0.0", "atlas-card"),
        exports: { blocs: [], themeTokens: [] },
    });

    expect(dependencyIssues([{ release: provider }, { release: consumer }], [target])).toEqual([
        "storefront requires text atlas.title generation 1.",
        "storefront requires asset atlas.logo.svg generation 1.",
    ]);
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

test("stores exact page snapshots separately and verifies their digest", async () => {
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
    expect(page.afterContent).toBe("<atlas-panel></atlas-panel>");
    expect(page.afterContentDigest).toMatch(/^sha256:/);
    await db.get("collection_migrations").updateOne({ _id: completed.id }, { $set: { operationGroups: [] } });
    expect(await storage.getPageBatch(completed.id, 0, 10)).toMatchObject([
        { afterContent: "<atlas-panel></atlas-panel>", state: "applied" },
    ]);
    await db
        .get("collection_migration_pages")
        .updateOne({ migrationId: completed.id }, { $set: { afterContentDigest: "sha256:corrupt" } });
    expect(await storage.getProgress(completed.id)).toMatchObject({ totalPages: 1, appliedPages: 1 });
    await expect(storage.getPageBatch(completed.id, 0, 1)).rejects.toThrow("failed its digest");
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
    expect((await fixture.storage.getPageBatch(completed.id, 0, 1))[0]).toMatchObject({
        state: "rolled-back",
        rolledBackRevision: 3,
    });
});

test("cancels cleanly when a page changes before maintenance owns the snapshot", async () => {
    const fixture = await migrationFixture();
    let migrationId = "";
    const racingStorage = new Proxy(fixture.storage, {
        get(target, property) {
            if (property === "create") {
                return async (...args: Parameters<typeof target.create>) => {
                    const created = await target.create(...args);
                    const [record] = args;
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

test("rejects execution when the reviewed plan digest changed", async () => {
    const fixture = await migrationFixture();
    let stagedId = "";
    const storage = new Proxy(fixture.storage, {
        get(target, property) {
            if (property === "stagePageBatch") {
                return async (...args: Parameters<typeof target.stagePageBatch>) => {
                    [stagedId] = args;
                    return target.stagePageBatch(...args);
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    const service = new CollectionMigrationService(fixture.repository, fixture.collections, storage);
    const plan = await service.plan("site", [{ digest: fixture.next.digest }], 1);
    await fixture.repository.updatePage({ id: fixture.page.id, title: "Changed" }, fixture.page.revision);

    await expect(service.execute("site", [{ digest: fixture.next.digest }], 1, plan.planDigest)).rejects.toThrow(
        "migration plan changed",
    );
    expect(stagedId).not.toBe("");
    expect(await fixture.storage.getPageBatch(stagedId, 0, 10)).toEqual([]);
    expect((await fixture.collections.snapshot("site")).collections[0]!.digest).toBe(fixture.previous.digest);
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

function asset(id: string, bytes: Uint8Array) {
    return {
        id,
        mediaType: "image/svg+xml",
        byteLength: bytes.byteLength,
        digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    };
}

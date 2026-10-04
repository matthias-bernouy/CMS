import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryCmsRepository, ValidatingCmsRepository, withInstalledCollections } from "@bernouy/cms-content";
import { CollectionMigrationService, MemoryCollectionMigrationStorage } from "@bernouy/cms-content/migrations";
import { MongoCollectionMigrationStorage } from "@bernouy/cms-content/mongo";
import type { Db } from "mongodb";
import { FakeContentDb } from "../../mongo/contentMongoFixture";

test("keeps an audit after the full rollback journal is pruned", async () => {
    const fixture = await fixtureWithMigration();
    const service = new CollectionMigrationService(fixture.repository, fixture.collections, fixture.storage, {
        rollbackRetentionCount: 0,
    });
    const completed = await service.execute("site", [{ digest: fixture.nextDigest }], 1);
    await eventually(async () => (await fixture.storage.get(completed.id)) === null);

    expect(await service.get("site", completed.id)).toBeNull();
    expect(await service.getProgress("site", completed.id)).toMatchObject({
        status: "completed",
        totalPages: 1,
        appliedPages: 1,
    });
    expect(await service.listAudits("site")).toEqual([
        expect.objectContaining({ id: completed.id, status: "completed", totalPages: 1 }),
    ]);
});

test("resumes a Mongo journal purge interrupted after its audit was archived", async () => {
    const fixture = await fixtureWithMigration();
    const db = new FakeContentDb();
    const storage = new MongoCollectionMigrationStorage(db as unknown as Db);
    await storage.init();
    const service = new CollectionMigrationService(fixture.repository, fixture.collections, storage);
    const completed = await service.execute("site", [{ digest: fixture.nextDigest }], 1);
    let interrupted = false;
    db.get("collection_migration_pages").beforeDeleteMany = async () => {
        if (!interrupted) {
            interrupted = true;
            throw new Error("simulated purge interruption");
        }
    };

    await expect(storage.pruneTerminal("site", 0)).rejects.toThrow("simulated purge interruption");
    expect(await db.get("collection_migrations").findOne({ _id: completed.id })).toMatchObject({ pruning: true });
    expect(await db.get("collection_migration_audits").findOne({ _id: completed.id })).toBeTruthy();

    db.get("collection_migration_pages").beforeDeleteMany = undefined;
    const restarted = new MongoCollectionMigrationStorage(db as unknown as Db);
    await restarted.init();
    expect(await db.get("collection_migrations").findOne({ _id: completed.id })).toBeNull();
    expect(await db.get("collection_migration_pages").findOne({ migrationId: completed.id })).toBeNull();
    expect(await restarted.getProgress(completed.id)).toMatchObject({ status: "completed", totalPages: 1 });
});

test("reports retention failures without changing the completed migration result", async () => {
    const fixture = await fixtureWithMigration();
    const errors: Error[] = [];
    const failingStorage = new Proxy(fixture.storage, {
        get(target, property) {
            if (property === "archiveTerminal") {
                return async () => {
                    throw new Error("simulated audit failure");
                };
            }
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    const service = new CollectionMigrationService(fixture.repository, fixture.collections, failingStorage, {
        onRetentionError: (error) => errors.push(error),
    });

    const completed = await service.execute("site", [{ digest: fixture.nextDigest }], 1);
    expect(completed.status).toBe("completed");
    expect(errors.map(({ message }) => message)).toEqual(["simulated audit failure"]);
});

async function fixtureWithMigration() {
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
    return { collections, repository, nextDigest: next.digest, storage: new MemoryCollectionMigrationStorage() };
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

async function eventually(condition: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await condition()) {
            return;
        }
        await Bun.sleep(1);
    }
    throw new Error("Condition was not reached");
}

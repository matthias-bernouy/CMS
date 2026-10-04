import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryCmsRepository, ValidatingCmsRepository, withInstalledCollections } from "@bernouy/cms-content";
import { CollectionMigrationService, MemoryCollectionMigrationStorage } from "@bernouy/cms-content/migrations";

test("blocks removal of a collection text still referenced by a page", async () => {
    const fixture = await referenceFixture({ texts: [{ id: "legacy-title", values: { en: "Legacy" } }] });
    const next = await fixture.collections.importRelease({
        ...release("2.0.0", "atlas-card"),
        dataGeneration: 2,
        migrations: [
            {
                fromGeneration: 1,
                toGeneration: 2,
                operations: [{ kind: "remove-text-override", id: "legacy-title" }],
            },
        ],
    });
    await fixture.repository.insertPage("/demo", "Demo", "<p>{{ cms.i18n.atlas.legacy-title }}</p>");

    const plan = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    expect(plan.blockedReasons).toContainEqual(expect.stringContaining("collection text atlas.legacy-title"));
});

test("blocks target changes that would break a site-owned bloc", async () => {
    const fixture = await referenceFixture();
    const next = await fixture.collections.importRelease({
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
    await fixture.repository.createBloc({
        id: "local-shell",
        name: "Local shell",
        group: "Local",
        description: "",
        viewJS: "",
        compositionHTML: "<atlas-card></atlas-card>",
        ownership: { kind: "code-managed" },
    });

    const plan = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    expect(plan.blockedReasons).toContainEqual(expect.stringContaining("Site bloc local-shell composition"));
});

test("blocks removal of a collection view used by a site dashboard", async () => {
    const fixture = await referenceFixture({
        translations: {
            en: { "collection.name": "Atlas", "bloc.label": "Card", "view.name": "Legacy view" },
        },
        views: [{ id: "legacy", name: "view.name", html: "<p>Legacy</p>" }],
    });
    const next = await fixture.collections.importRelease({
        ...release("2.0.0", "atlas-card"),
        dataGeneration: 2,
        migrations: [{ fromGeneration: 1, toGeneration: 2, operations: [] }],
    });
    fixture.service.addReferenceSource({
        id: "dashboards",
        async snapshot() {
            return {
                digest: "sha256:dashboard-v1",
                references: [{ kind: "view", collectionId: "atlas", id: "legacy", location: "Dashboard Operations" }],
            };
        },
    });

    const plan = await fixture.service.plan("site", [{ digest: next.digest }], 1);
    expect(plan.blockedReasons).toContain(
        "Dashboard Operations still references removed collection view atlas:legacy.",
    );
});

async function referenceFixture(previousPatch: Record<string, unknown> = {}) {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const previous = await collections.importRelease({ ...release("1.0.0", "atlas-card"), ...previousPatch });
    await collections.install("site", previous.digest, 0);
    const repository = new ValidatingCmsRepository(
        withInstalledCollections(new InMemoryCmsRepository(), collections, "site"),
    );
    return {
        collections,
        repository,
        service: new CollectionMigrationService(repository, collections, new MemoryCollectionMigrationStorage()),
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

import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryCmsRepository, ValidatingCmsRepository, withInstalledCollections } from "@bernouy/cms-content";
import { CollectionMigrationService, MemoryCollectionMigrationStorage } from "@bernouy/cms-content/migrations";

export async function referenceFixture(previousPatch: Record<string, unknown> = {}) {
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

export function release(version: string, id: string): Record<string, unknown> {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "atlas",
        publisherId: "atlas.official",
        version,
        name: "collection.name",
        locale: "en",
        translations: {
            en: {
                "collection.name": "Atlas",
                "bloc.label": "Card",
                "text.category.content": "Content",
                "text.group.general": "General",
                "text.label.legacy-title": "Legacy title",
            },
        },
        assets: [],
        blocs: [
            {
                kind: "component",
                id,
                label: "bloc.label",
                shadowdom: '<div><slot name="content"></slot></div>',
                uses: [],
                requires: [],
                slots: { content: { accepts: [{ kind: "rich-text", profile: "prose" }] } },
            },
        ],
    };
}

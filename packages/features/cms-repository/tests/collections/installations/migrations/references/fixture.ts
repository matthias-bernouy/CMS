import { collectionFixture } from "../../../admission/examples/buildFixture";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { InMemoryCmsRepository, ValidatingCmsRepository } from "@bernouy/cms-content";
import {
    CollectionMigrationService,
    MemoryCollectionMigrationStorage,
} from "@bernouy/cms-repository/collections/installations";

export async function referenceFixture(previousPatch: Record<string, unknown> = {}) {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const previous = await collections.importRelease(
        collectionFixture({ ...release("1.0.0", "atlas-card"), ...previousPatch }),
    );
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
    return collectionFixture({
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
                description: "bloc.label",
                categories: ["bloc.label"],

                kind: "component",
                root: { accepts: ["div"] },
                id,
                label: "bloc.label",
                markup: '<div><slot name="content"></slot></div>',
                uses: [],
                requires: [],
                slots: { content: { accepts: [{ kind: "native-content", profile: "prose" }] } },
            },
        ],
    });
}

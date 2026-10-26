import { collectionFixture } from "../../admission/examples/buildFixture";
import { expect, test } from "bun:test";
import { withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { createHash } from "node:crypto";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryContentRepository } from "@bernouy/cms-content";

class CountingStorage extends MemoryCollectionStorage {
    metadataReads = 0;
    assetReads = 0;

    override async getReleaseMetadata(digest: string) {
        this.metadataReads += 1;
        return super.getReleaseMetadata(digest);
    }

    override async getAsset(
        digest: string,
        assetId: string,
        range?: Parameters<MemoryCollectionStorage["getAsset"]>[2],
    ) {
        this.assetReads += 1;
        return super.getAsset(digest, assetId, range);
    }
}

test("indexes installed Blocs once per collection revision", async () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const storage = new CountingStorage();
    const store = new CollectionStore(storage);
    const artifact = await store.importRelease(
        collectionFixture({
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            collectionId: "cached",
            publisherId: "example",
            version: "1.0.0",
            name: "collection.name",
            locale: "en",
            translations: { en: { "collection.name": "Cached", "bloc.card.label": "Card" } },
            assets: [
                {
                    id: "card.svg",
                    mediaType: "image/svg+xml",
                    byteLength: bytes.byteLength,
                    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
                },
            ],
            blocs: [
                {
                    description: "bloc.card.label",
                    categories: ["bloc.card.label"],

                    kind: "component",
                    root: { accepts: ["div"] },
                    id: "cached-card",
                    label: "bloc.card.label",
                    markup: "<article></article>",
                    uses: [],
                    requires: [],
                    slots: {},
                },
            ],
        }),
        [{ id: "card.svg", bytes }],
    );
    await store.install("site", artifact.digest, 0);
    storage.metadataReads = 0;
    storage.assetReads = 0;
    const repository = withInstalledCollections(new InMemoryContentRepository(), store, "site");

    await repository.getBlocViewJS("cached-card");
    await repository.getBlocViewJS("cached-card");
    expect(await repository.getBlocViewsJS(["cached-card", "missing", "cached-card"])).toEqual({
        "cached-card": null,
        missing: null,
    });
    await repository.getBlocRecord("cached-card");
    await repository.getBlocsList();
    await repository.getContentContributions?.();
    await repository.getContentContributions?.();
    expect(storage.metadataReads).toBe(1);
    expect(storage.assetReads).toBe(0);

    await store.saveTexts("site", "cached", 1, {});
    storage.metadataReads = 0;
    storage.assetReads = 0;
    await repository.getBlocViewJS("cached-card");
    expect(storage.metadataReads).toBe(1);
    expect(storage.assetReads).toBe(0);
});

test("rejects repository methods that have not been classified by the installed-resource boundary", () => {
    const local = Object.assign(new InMemoryContentRepository(), { accidentalMutation: () => undefined });
    const repository = withInstalledCollections(local, new CollectionStore(new MemoryCollectionStorage()), "site");

    expect(() => (repository as typeof repository & typeof local).accidentalMutation()).toThrow(
        "Unclassified ContentRepository method",
    );
});

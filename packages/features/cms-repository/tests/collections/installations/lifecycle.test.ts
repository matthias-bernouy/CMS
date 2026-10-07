import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "../../../src/exports/collections/installations";

function release(collectionId: string, version = "1.0.0") {
    return {
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId,
        publisherId: "atlas.official",
        version,
        name: "collection.name",
        locale: "en",
        translations: { en: { "collection.name": collectionId, "bloc.label": "Block" } },
        assets: [],
        blocs: [
            {
                kind: "composition",
                id: `${collectionId}-block`,
                label: "bloc.label",
                lightdom: "<p>{{ copy }}</p>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
    };
}

test("installs an exact dependency graph atomically in any request order", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const foundation = {
        ...release("foundation"),
        exports: { blocs: ["foundation-block"], themeTokens: [] },
    };
    const consumer = release("consumer");
    consumer.blocs[0]!.lightdom = "<foundation-block></foundation-block>";
    consumer.blocs[0]!.uses = ["foundation-block"];
    Object.assign(consumer, {
        dependencies: [
            {
                collectionId: "foundation",
                publisherId: "atlas.official",
                versionRange: "^1.0.0",
                imports: { blocs: [{ id: "foundation-block", generation: 1 }], themeTokens: [] },
            },
        ],
    });
    const foundationArtifact = await store.importRelease(foundation);
    const consumerArtifact = await store.importRelease(consumer);

    const installed = await store.installMany(
        "site",
        [
            { digest: consumerArtifact.digest, repositoryId: "local" },
            { digest: foundationArtifact.digest, repositoryId: "local" },
        ],
        0,
    );

    expect(installed.revision).toBe(1);
    expect(installed.collections.map(({ collectionId }) => collectionId).sort()).toEqual(["consumer", "foundation"]);
    await expect(store.installMany("invalid", [{ digest: consumerArtifact.digest }], 0)).rejects.toThrow(
        "requires foundation",
    );
    expect(await store.snapshot("invalid")).toMatchObject({ revision: 0, collections: [] });

    await expect(store.uninstall("site", "foundation", 1)).rejects.toThrow("required by");
    await store.uninstall("site", "consumer", 1);
    const empty = await store.uninstall("site", "foundation", 2);
    expect(empty).toMatchObject({ revision: 3, collections: [] });
});

test("validates mutable configuration and preserves it through compatible upgrades", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = {
        ...release("configurable"),
        configuration: {
            schema: {
                type: "object",
                properties: { title: { type: "string", maxLength: 32 } },
                required: ["title"],
            },
            defaults: { title: "Default" },
        },
    };
    const first = await store.importRelease(initial);
    await store.install("site", first.digest, 0, "local");
    await store.saveConfiguration("site", "configurable", 1, { title: "Custom" });
    await expect(store.saveConfiguration("site", "configurable", 2, { title: 42 })).rejects.toThrow(
        "Invalid collection configuration",
    );
    expect((await store.snapshot("site")).revision).toBe(2);

    const wider = structuredClone(initial);
    wider.version = "1.1.0";
    wider.configuration.schema.properties.subtitle = { type: "string", maxLength: 64 };
    wider.configuration.defaults.subtitle = "Optional";
    const widerArtifact = await store.importRelease(wider);
    const upgraded = await store.upgrade("site", widerArtifact.digest, 2, "local");
    expect(upgraded.collections[0]!.configuration).toEqual({ title: "Custom" });

    const narrower = structuredClone(initial);
    narrower.version = "1.2.0";
    narrower.configuration.schema.properties.title.maxLength = 4;
    narrower.configuration.defaults.title = "Tiny";
    const narrowerArtifact = await store.importRelease(narrower);
    await expect(store.upgrade("site", narrowerArtifact.digest, 3, "local")).rejects.toThrow(
        "narrows the collection configuration contract",
    );
    expect((await store.snapshot("site")).collections[0]!.digest).toBe(widerArtifact.digest);
});

test("memory storage enforces the same artifact and state boundaries as durable storage", async () => {
    const storage = new MemoryCollectionStorage();
    const store = new CollectionStore(storage);
    const admitted = await store.importRelease(release("verified"));

    await expect(
        storage.putRelease({
            digest: `sha256:${"0".repeat(64)}`,
            release: admitted.release,
            assets: [],
        }),
    ).rejects.toThrow("release digest mismatch");
    await expect(storage.compareAndSet("site", 0, { revision: 2, installations: [] })).rejects.toThrow(
        "Invalid collection site state transition",
    );
});

test("an upgrade introducing configuration initializes the admitted defaults", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = await store.importRelease(release("configured-later"));
    await store.install("site", initial.digest, 0, "local");
    const next = {
        ...release("configured-later", "1.1.0"),
        configuration: {
            schema: {
                type: "object",
                properties: { mode: { type: "string", maxLength: 16, enum: ["safe", "fast"] } },
                required: ["mode"],
            },
            defaults: { mode: "safe" },
        },
    };
    const admitted = await store.importRelease(next);

    const upgraded = await store.upgrade("site", admitted.digest, 1, "local");

    expect(upgraded.collections[0]!.configuration).toEqual({ mode: "safe" });
});

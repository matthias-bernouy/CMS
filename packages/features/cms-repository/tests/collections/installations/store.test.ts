import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "../../../src/exports/collections/installations";
import { collectionDocument, textDefinition } from "../fixtures";
import { contractDocument, releaseCatalogue } from "../../providers/support/fixtures";

function release() {
    return {
        ...collectionDocument({
            "bloc.card.label": "Card",
            "bloc.welcome.label": "Welcome",
            "setting.tone.label": "Tone",
        }),
        assets: [],
        blocs: [
            {
                kind: "composition",
                id: "atlas-welcome",
                label: "bloc.welcome.label",
                lightdom: "<p>{{ copy }}</p>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
        texts: [textDefinition("title", { en: "Hello", fr: "Bonjour" })],
        locale: "en",
    };
}

test("release identity is immutable and installation keeps a digest pin", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const input = release();
    const artifact = await store.importRelease(input);
    await store.install("a", artifact.digest, 0);
    input.texts[0]!.values.en = "Changed";
    await expect(store.importRelease(input)).rejects.toThrow("Immutable");
    const state = await store.snapshot("a");
    expect(state.collections[0]!.digest).toBe(artifact.digest);
    expect(state.collections[0]!.release.texts![0]!.values.en).toBe("Hello");
    expect((await store.snapshot("b")).collections).toEqual([]);
});

test("concurrent saves conflict, isolate site overrides and preserve release defaults", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(release());
    await store.install("a", artifact.digest, 0);
    await store.install("b", artifact.digest, 0);
    const results = await Promise.allSettled([
        store.saveTexts("a", "atlas", 1, { title: { fr: "Salut" } }),
        store.saveTexts("a", "atlas", 1, { title: { fr: "Bonsoir" } }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await store.snapshot("a")).revision).toBe(2);
    expect((await store.snapshot("b")).collections[0]!.textOverrides).toEqual({});
    expect((await store.snapshot("a")).collections[0]!.release.texts![0]!.values.fr).toBe("Bonjour");
    await expect(store.saveTexts("a", "atlas", 2, { missing: { fr: "No" } })).rejects.toThrow();
    await store.saveTexts("a", "atlas", 2, {});
    expect((await store.snapshot("a")).collections[0]!.textOverrides).toEqual({});
});

test("compatible repository upgrade preserves site texts and rejects removals", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const old = await store.importRelease(release());
    await store.install("site", old.digest, 0, "local");
    await store.saveTexts("site", "atlas", 1, { title: { fr: "Salut" } });
    const newer = await store.importRelease({
        ...release(),
        version: "1.1.0",
        texts: [textDefinition("title", { en: "New", fr: "Nouveau" }), textDefinition("other", { en: "Other" })],
    });
    await store.upgrade("site", newer.digest, 2, "local");
    const current = (await store.snapshot("site")).collections[0]!;
    expect(current.digest).toBe(newer.digest);
    expect(current.textOverrides.title?.fr).toBe("Salut");
    expect(current.repositoryId).toBe("local");
    await expect(store.upgrade("site", old.digest, 3, "local")).rejects.toThrow("newer");
    const removing = await store.importRelease({ ...release(), version: "1.2.0", texts: [] });
    await expect(store.upgrade("site", removing.digest, 3, "local")).rejects.toThrow("removes");
});

test("imports verified assets and contract requirements into the installation store", async () => {
    const contracts = await releaseCatalogue(contractDocument("catalog", "item.list"));
    const store = new CollectionStore(new MemoryCollectionStorage(), contracts);
    const bytes = new TextEncoder().encode("asset bytes");
    const input = release();
    input.assets = [
        {
            id: "thumbnail.txt",
            mediaType: "text/plain",
            byteLength: bytes.byteLength,
            digest: `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`,
        },
    ];
    input.blocs[0]!.thumbnail = "thumbnail.txt";
    input.blocs[0]!.requires = [{ contractId: "catalog", capabilityId: "item.list", versionRange: "^1.0.0" }];

    const artifact = await store.importRelease(input, [{ id: "thumbnail.txt", bytes }]);
    expect(await store.getReleaseAsset(artifact.digest, "thumbnail.txt")).toEqual(bytes);
    expect(await store.getReleaseAsset(artifact.digest, "thumbnail.txt", { start: 1, end: 2 })).toEqual(
        bytes.slice(1, 3),
    );
    await store.install("site", artifact.digest, 0, "local");
    expect((await store.snapshot("site")).collections[0]!.release.blocs[0]!.requires).toHaveLength(1);
});

test("resolves asset metadata in one batch without hydrating unrelated releases", async () => {
    const storage = new MemoryCollectionStorage();
    const store = new CollectionStore(storage);
    const asset = async (id: string, value: string) => {
        const bytes = new TextEncoder().encode(value);
        return {
            definition: {
                id,
                mediaType: "text/plain",
                byteLength: bytes.byteLength,
                digest: `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}` as const,
            },
            bytes,
        };
    };
    const firstAsset = await asset("first.txt", "first");
    const secondAsset = await asset("second.txt", "second");
    const first = await store.importRelease({ ...release(), assets: [firstAsset.definition], blocs: [] }, [
        { id: firstAsset.definition.id, bytes: firstAsset.bytes },
    ]);
    const second = await store.importRelease(
        {
            ...release(),
            collectionId: "other",
            version: "1.0.0",
            assets: [secondAsset.definition],
            blocs: [],
        },
        [{ id: secondAsset.definition.id, bytes: secondAsset.bytes }],
    );
    await store.installMany("site", [{ digest: first.digest }, { digest: second.digest }], 0);
    const reads: string[] = [];
    const readMetadata = storage.getReleaseMetadata.bind(storage);
    storage.getReleaseMetadata = async (digest) => {
        reads.push(digest);
        return readMetadata(digest);
    };

    const resolved = await store.getInstalledAssetMetadataBatch("site", [
        { collectionId: "atlas", assetId: "first.txt" },
        { collectionId: "atlas", assetId: "first.txt" },
        { collectionId: "missing", assetId: "none" },
    ]);

    expect(resolved).toEqual([
        { collectionId: "atlas", digest: first.digest, asset: { ...firstAsset.definition, generation: 1 } },
    ]);
    expect(reads).toEqual([first.digest]);
});

test("upgrades may widen but never narrow the stored settings contract", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = release();
    initial.blocs[0] = {
        kind: "component",
        id: "atlas-card",
        label: "bloc.card.label",
        shadowdom: "<article></article>",
        uses: [],
        requires: [],
        slots: {},
        settings: [
            {
                id: "tone",
                label: "setting.tone.label",
                type: "string",
                default: "quiet",
                maxLength: 16,
                control: { kind: "text" },
            },
        ],
    };
    const old = await store.importRelease(initial);
    await store.install("site", old.digest, 0, "local");
    await store.saveTexts("site", "atlas", 1, { title: { fr: "Salut" } });
    const changedSettings = structuredClone(initial);
    changedSettings.version = "1.1.0";
    changedSettings.blocs[0]!.settings[0]!.maxLength = 32;
    const settingsArtifact = await store.importRelease(changedSettings);
    await expect(store.upgrade("site", settingsArtifact.digest, 2, "local")).resolves.toMatchObject({ revision: 3 });

    const narrowedSettings = structuredClone(changedSettings);
    narrowedSettings.version = "1.2.0";
    narrowedSettings.blocs[0]!.settings[0]!.maxLength = 8;
    const narrowedArtifact = await store.importRelease(narrowedSettings);
    await expect(store.upgrade("site", narrowedArtifact.digest, 3, "local")).rejects.toThrow("settings");
});

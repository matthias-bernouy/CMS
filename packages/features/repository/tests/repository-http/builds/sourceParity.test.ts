import { expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { InMemoryReleaseCatalogue } from "repository/exports/contracts/catalogue";
import { compileCollectionSources } from "repository/exports/repository/authoring/build";
import { prepareRemoteCollection } from "repository/repository/authoring/preparations/prepare";
import { readPreparation } from "repository/repository/authoring/preparations/record";
import { sourceFixture } from "../../../../../../tests/fixtures/repository/sourceBuild";

test("CMS preparation and standalone compilation retain identical sources with distinct workspace lifetimes", async () => {
    const f = await sourceFixture();
    const root = join(f.root, "preparations");
    let assetReads = 0;
    let inspections = 0;
    try {
        const preview = await prepareRemoteCollection(
            {
                root,
                contracts: new InMemoryReleaseCatalogue(),
                async readAsset(asset) {
                    assetReads++;
                    expect(asset.path).toBe("assets/data.txt");
                    return f.captured.assets[0]!.bytes;
                },
            },
            f.captured.sourceJson,
            async (artifact) => {
                inspections++;
                expect(artifact.digest).toBe(f.admission.digest);
                return { state: "complete", repositoryId: "repository", origin: "https://repository.test" };
            },
        );
        const { path, prepared } = await readPreparation(root, preview.preparationId, preview.digest);
        expect(preview.digest).toBe(f.admission.digest);
        expect(prepared.sourceJson).toBe(f.sourceJson);
        expect(await readFile(join(path, prepared.directory, "assets/data.txt"), "utf8")).toBe(
            "immutable source bytes",
        );
        expect(assetReads).toBe(1);
        expect(inspections).toBe(1);
        expect((await readdir(root)).sort()).toEqual([".write-lock", preview.preparationId].sort());
        const buildRoot = join(f.root, "standalone");
        const built = await compileCollectionSources(buildRoot, f.captured.sourceJson, f.captured.assets);
        expect(built.admission.digest).toBe(preview.digest);
        expect(built.sourceJson).toBe(prepared.sourceJson);
        expect(await readdir(buildRoot)).toEqual([".write-lock"]);
    } finally {
        await f.close();
    }
});

test("preparation refuses oversized assets before hydration and discards partial source files", async () => {
    const f = await sourceFixture();
    const root = join(f.root, "oversized");
    let assetReads = 0;
    let hydrations = 0;
    let inspections = 0;
    class OversizedBlob extends Blob {
        override get size() {
            return 10 * 1024 * 1024 + 1;
        }
        override async arrayBuffer() {
            hydrations++;
            return super.arrayBuffer();
        }
    }
    try {
        await expect(
            prepareRemoteCollection(
                {
                    root,
                    contracts: new InMemoryReleaseCatalogue(),
                    async readAsset() {
                        assetReads++;
                        return new OversizedBlob();
                    },
                },
                f.captured.sourceJson,
                async () => {
                    inspections++;
                    return { state: "complete", repositoryId: "repository", origin: "https://repository.test" };
                },
            ),
        ).rejects.toThrow("Source assets exceed the preparation limit");
        expect(assetReads).toBe(1);
        expect(hydrations).toBe(0);
        expect(inspections).toBe(0);
        expect(await readdir(root)).toEqual([".write-lock"]);
    } finally {
        await f.close();
    }
});

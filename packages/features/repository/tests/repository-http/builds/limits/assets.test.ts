import { encodePublicationUpload } from "repository/repository/publication/protocol";
import { ownerFixture, jsonRequest } from "../../publicationFixtures";
import { expect, test } from "bun:test";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { collectionBuildInput } from "repository/repository/authoring/preparations/source/input";
import { compileCollectionSources } from "repository/exports/repository/authoring/build";
import { prepareRemoteCollection } from "repository/repository/authoring/preparations/prepare";
import { InMemoryReleaseCatalogue } from "repository/exports/contracts/catalogue";
import { sourceFixture } from "../../../../../../../tests/fixtures/repository/sourceBuild";

function input(count: number, size: number) {
    class SizedBlob extends Blob {
        override get size() {
            return size;
        }
    }
    const assets = Array.from({ length: count }, (_, index) => ({ id: `${index}.txt`, bytes: new SizedBlob() }));
    const sourceJson = JSON.stringify({
        files: [{ path: "definition.json", content: JSON.stringify({ collectionId: "publisher/kit" }) }],
        assets: assets.map(({ id }) => ({ path: `assets/${id}`, fileId: "local", generation: "snapshot" })),
    });
    return { assets, sourceJson };
}

test("collection asset budgets allow 10 MiB per file and exactly 50 MiB combined", () => {
    const exact = input(5, 10 * 1024 * 1024);
    expect(collectionBuildInput(exact.sourceJson, exact.assets).assets).toHaveLength(5);
    expect(() =>
        collectionBuildInput(exact.sourceJson, [
            ...exact.assets.slice(0, 4),
            { id: "4.txt", bytes: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]) },
        ]),
    ).toThrow("build limit");
    const over = input(6, 9 * 1024 * 1024);
    expect(() => collectionBuildInput(over.sourceJson, over.assets)).toThrow("build limit");
});

test("CLI compilation and CMS preparation admit 1,024 small assets with identical retained sources", async () => {
    const f = await sourceFixture();
    const captured = JSON.parse(f.captured.sourceJson);
    const assets = Array.from({ length: 1024 }, (_, index) => ({
        id: `file-${index}.txt`,
        bytes: new Blob([`asset ${index}`]),
    }));
    captured.assets = assets.map(({ id }) => ({ path: `assets/${id}`, fileId: "local", generation: "snapshot" }));
    const sourceJson = JSON.stringify(captured);
    let reads = 0;
    const byId = new Map(assets.map(({ id, bytes }) => [id, bytes]));
    try {
        const built = await compileCollectionSources(join(f.root, "many-assets-build"), sourceJson, assets);
        expect(built.admission.assets).toHaveLength(1024);
        const prepared = await prepareRemoteCollection(
            {
                root: join(f.root, "many-assets-preview"),
                contracts: new InMemoryReleaseCatalogue(),
                readAsset: async (asset) => {
                    reads++;
                    return byId.get(asset.path.slice(7))!;
                },
            },
            sourceJson,
            async () => ({ state: "complete", repositoryId: "repository", origin: "https://repository.test" }),
        );
        expect(prepared.digest).toBe(built.admission.digest);
        expect(reads).toBe(1024);
        expect(await readdir(join(f.root, "many-assets-build"))).toEqual([".write-lock"]);
    } finally {
        await f.close();
    }
});

test("oversized collection asset declarations are refused before an upload is created", async () => {
    const f = await sourceFixture();
    const { application: app, owner } = await ownerFixture(join(f.root, "early-refusal"));
    let created = 0;
    const create = app.uploads.create.bind(app.uploads);
    app.uploads.create = (...args) => {
        created++;
        return create(...args);
    };
    try {
        const manifest = new TextDecoder().decode(
            encodePublicationUpload({
                kind: "collection",
                canonicalJson: f.admission.canonicalJson,
                sourceJson: f.sourceJson,
                assets: [{ id: "data.txt", byteLength: 10 * 1024 * 1024 + 1, digest: f.admission.digest }],
            }),
        );
        const response = await app.handle(
            jsonRequest("/v1/uploads", owner.token, { namespace: "publisher", namespaceRevision: 1, manifest }),
        );
        expect(response.status).toBe(409);
        expect(created).toBe(0);
    } finally {
        await app.close();
        await f.close();
    }
});

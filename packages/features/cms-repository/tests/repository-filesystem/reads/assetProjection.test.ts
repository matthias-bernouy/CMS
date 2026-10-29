import { expect, spyOn, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";

async function fixture() {
    const bytes = new Uint8Array([1, 2, 3]);
    const artifact = await admitCollectionRelease(
        {
            kind: "collection",
            protocol: "ulvia-collection/v1",
            schemaDialect: "ulvia-schema/v1",
            publisherId: "example.official",
            collectionId: "example",
            version: "1.0.0",
            name: "name",
            locale: "en",
            translations: { en: { name: "Example" } },
            blocs: [],
            assets: [
                {
                    id: "sample.bin",
                    mediaType: "application/octet-stream",
                    byteLength: bytes.length,
                    digest: `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`,
                },
            ],
        },
        [{ id: "sample.bin", bytes }],
    );
    const root = await mkdtemp(join(tmpdir(), "collection-assets-"));
    const repository = new LocalCollectionRepository(root);
    await repository.store(artifact);
    await repository.getMetadata("example.official", "example", "1.0.0");
    return {
        root,
        repository,
        artifact,
        bytes,
        get: () => repository.getAsset("example.official", "example", "1.0.0", "sample.bin"),
    };
}

test("warm asset reads project one definition instead of materializing the entire release", async () => {
    const f = await fixture();
    const fullRead = spyOn(f.repository, "getMetadata").mockImplementation(async () => {
        throw new Error("Unexpected full clone");
    });
    try {
        const asset = await f.get();
        expect(new Uint8Array(await asset!.bytes.arrayBuffer())).toEqual(f.bytes);
        expect(fullRead).not.toHaveBeenCalled();
        expect(await f.repository.getAsset("example.official", "example", "1.0.0", "missing.bin")).toBeNull();
    } finally {
        fullRead.mockRestore();
        await rm(f.root, { recursive: true, force: true });
    }
});

test("warm projections still observe changed release bytes and corrupt asset contents", async () => {
    const f = await fixture();
    try {
        const releasePath = join(f.root, "releases/example.official/example/1.0.0.json");
        await writeFile(releasePath, `${f.artifact.canonicalJson}\n`);
        await expect(f.get()).rejects.toThrow();
        await writeFile(releasePath, f.artifact.canonicalJson);
        expect(await f.get()).not.toBeNull();
        const assetRoot = join(f.root, "assets/collections", f.artifact.digest.slice("sha256:".length));
        const [file] = await readdir(assetRoot);
        await writeFile(join(assetRoot, file!), new Uint8Array([9, 9, 9]));
        await expect(f.get()).rejects.toThrow();
    } finally {
        await rm(f.root, { recursive: true, force: true });
    }
});

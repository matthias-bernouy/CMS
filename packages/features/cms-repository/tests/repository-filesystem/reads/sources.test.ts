import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import {
    FilesystemCollectionRepository,
    FilesystemProviderRepository,
    FilesystemRepositoryCatalogueIndex,
    LocalCollectionRepository,
} from "@bernouy/cms-repository/repository/filesystem";
import { collectionDocument } from "../../collections/fixtures";

test("local source ports verify exact references and return independent collection metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "local-sources-"));
    try {
        const artifact = await admitCollectionRelease(collectionDocument());
        await new LocalCollectionRepository(root).store(artifact);
        const index = new FilesystemRepositoryCatalogueIndex(root);
        const collections = new FilesystemCollectionRepository("bundled", root, index);
        const [reference] = await collections.list();
        expect(reference?.repositoryId).toBe("bundled");
        const first = (await collections.getMetadata(reference!)) as Record<string, unknown>;
        first.name = "changed";
        expect(((await collections.getMetadata(reference!)) as Record<string, unknown>).name).toBe(
            artifact.release.name,
        );
        expect((await collections.get(reference!)).release).toEqual(artifact.release);
        await expect(collections.get({ ...reference!, digest: `sha256:${"0".repeat(64)}` })).rejects.toThrow(
            "digest mismatch",
        );
        await expect(collections.getMetadata({ ...reference!, publisherId: "../escape" })).rejects.toThrow("reference");
        const providers = new FilesystemProviderRepository("bundled", root, index);
        expect(await providers.list("contract")).toEqual([]);
        await expect(
            providers.get({
                kind: "contract",
                publisherId: "../escape",
                id: "sample",
                version: "1.0.0",
                digest: artifact.digest,
            }),
        ).rejects.toThrow("reference");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

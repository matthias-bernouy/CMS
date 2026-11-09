import { expect, test } from "bun:test";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { compileCollectionSources } from "repository/exports/repository/authoring/build";
import { canonicalSourceSnapshot, parseSourceSnapshot } from "repository/repository/authoring/snapshot";
import { LocalCollectionRepository } from "repository/repository/filesystem/artifacts/collections";
import { FilesystemRepositorySourceStore } from "repository/repository/sources/filesystem";
import { sourceFixture } from "../../../../../../tests/fixtures/repository/sourceBuild";
import { ownerFixture } from "../publicationFixtures";

test.each([false, true])("source repair preserves text-authored assets with binary references: %s", async (mixed) => {
    const f = await sourceFixture();
    const root = join(f.root, "registry");
    const { application: app, owner } = await ownerFixture(root);
    try {
        const snapshot = parseSourceSnapshot(f.sourceJson);
        const sourceJson = canonicalSourceSnapshot({
            files: [...snapshot.files, { path: "assets/data.txt", content: "immutable source bytes" }],
            assets: mixed ? [{ path: "assets/extra.txt", fileId: "local", generation: "snapshot" }] : [],
        });
        const assets = mixed ? [{ id: "extra.txt", bytes: new Blob(["separate binary reference"]) }] : [];
        const built = await compileCollectionSources(join(f.root, "source-build"), sourceJson, assets);
        const published = await app.registry.publish({
            kind: "collection",
            canonicalJson: built.admission.canonicalJson,
            sourceJson: built.sourceJson,
            assets,
        });
        expect(published).toMatchObject({ added: true, digest: built.admission.digest });
        await rm(join(root, "source-snapshots/publisher/kit/1.0.0.json"));
        const sources = new FilesystemRepositorySourceStore(root);
        expect(await sources.get("publisher", "publisher/kit", "1.0.0")).toBeNull();
        const input = {
            namespace: "publisher",
            namespaceRevision: 1,
            collectionId: "publisher/kit",
            version: "1.0.0",
            sourceJson: built.sourceJson,
            releaseDigest: built.admission.digest,
        };
        await expect(
            app.service.sources.putCollection({ ...input, releaseDigest: `sha256:${"0".repeat(64)}` }, owner.accountId),
        ).rejects.toMatchObject({ code: "REJECTED" });
        expect(await sources.get("publisher", "publisher/kit", "1.0.0")).toBeNull();
        await app.service.sources.putCollection(input, owner.accountId);
        await app.service.sources.putCollection(input, owner.accountId);
        const retained = { sourceJson: built.sourceJson, releaseDigest: built.admission.digest };
        expect(await sources.get("publisher", "publisher/kit", "1.0.0")).toEqual(retained);
        const invalid = JSON.parse(built.sourceJson);
        invalid.files.find(({ path }: { path: string }) => path === "definition.json").content = "null";
        await expect(
            app.service.sources.putCollection({ ...input, sourceJson: JSON.stringify(invalid) }, owner.accountId),
        ).rejects.toMatchObject({ code: "REJECTED" });
        expect(await sources.get("publisher", "publisher/kit", "1.0.0")).toEqual(retained);
        const artifact = await new LocalCollectionRepository(root).get("publisher", "publisher/kit", "1.0.0");
        expect(artifact?.digest).toBe(built.admission.digest);
        expect(await artifact!.assets.find(({ id }) => id === "data.txt")!.bytes.text()).toBe("immutable source bytes");
    } finally {
        await app.close();
        await f.close();
    }
});

import { expect, test } from "bun:test";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { FilesystemRepositoryPublicationRegistry } from "repository/repository/filesystem/mutations/publicationRegistry";
import { LocalCollectionRepository } from "repository/repository/filesystem/artifacts/collections";
import { FilesystemRepositorySourceStore } from "repository/repository/sources/filesystem";
import { sourceFixture } from "../../../../../../tests/fixtures/repository/sourceBuild";

test("Repository recompiles sources and makes the release visible only after durable source retention", async () => {
    const f = await sourceFixture();
    const root = join(f.root, "remote");
    const registry = new FilesystemRepositoryPublicationRegistry(root);
    const releases = new LocalCollectionRepository(root);
    const sources = new FilesystemRepositorySourceStore(root);
    try {
        const { sourceJson: _sources, ...compiledOnly } = f.envelope;
        await expect(registry.publish(compiledOnly)).rejects.toThrow("require editable sources");
        expect(await releases.listMetadata()).toHaveLength(0);
        expect(await sources.get("publisher", "publisher/kit", "1.0.0")).toBeNull();
        const corrupted = JSON.parse(f.sourceJson);
        corrupted.files.find((file: { path: string }) => file.path === "translations/en/metadata.json").content =
            '{"collection.name":"Different","collection.description":"Edited"}';
        await expect(registry.publish({ ...f.envelope, sourceJson: JSON.stringify(corrupted) })).rejects.toThrow(
            "differs",
        );
        await expect(registry.publish({ ...f.envelope, assets: [] })).rejects.toThrow();
        expect(await releases.listMetadata()).toHaveLength(0);
        expect(await sources.get("publisher", "publisher/kit", "1.0.0")).toBeNull();
        expect(await registry.publish(f.envelope)).toMatchObject({ added: true, digest: f.admission.digest });
        expect(await sources.get("publisher", "publisher/kit", "1.0.0")).toEqual({
            sourceJson: f.sourceJson,
            releaseDigest: f.admission.digest,
        });
        expect((await releases.get("publisher", "publisher/kit", "1.0.0"))?.canonicalJson).toBe(
            f.admission.canonicalJson,
        );
        expect(await registry.publish(f.envelope)).toMatchObject({ added: false, digest: f.admission.digest });
        expect(await registry.publish(compiledOnly)).toMatchObject({ added: false });
        const assets = await releases.get("publisher", "publisher/kit", "1.0.0");
        expect(await assets!.assets[0]!.bytes.text()).toBe("immutable source bytes");
    } finally {
        await f.close();
    }
});

test("a failure after source retention leaves no release marker and an exact retry completes publication", async () => {
    const f = await sourceFixture();
    const root = join(f.root, "interrupted");
    const repository = new LocalCollectionRepository(root);
    const sources = new FilesystemRepositorySourceStore(root);
    try {
        await expect(
            repository.store(f.admission, async () => {
                await sources.put("publisher", "publisher/kit", "1.0.0", {
                    sourceJson: f.sourceJson,
                    releaseDigest: f.admission.digest,
                });
                throw new Error("simulated process interruption before visibility");
            }),
        ).rejects.toThrow("interruption");
        expect(await repository.listMetadata()).toHaveLength(0);
        expect(await sources.get("publisher", "publisher/kit", "1.0.0")).not.toBeNull();
        const registry = new FilesystemRepositoryPublicationRegistry(root);
        expect(await registry.publish(f.envelope)).toMatchObject({ added: true });
        expect(await readFile(join(root, "source-snapshots/publisher/kit/1.0.0.json"), "utf8")).toContain("sourceJson");
        await expect(
            registry.retainCollectionSources(
                { kind: "collection", publisherId: "publisher", id: "publisher/kit", version: "1.0.0" },
                "{}",
                f.admission.digest,
            ),
        ).rejects.toThrow();
        expect(await repository.listMetadata()).toHaveLength(1);
    } finally {
        await f.close();
    }
});

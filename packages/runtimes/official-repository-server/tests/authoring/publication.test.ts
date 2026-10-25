import { parseUlviaSchema, validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { expect, test } from "bun:test";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { RepositorySourceClient } from "@bernouy/cms-repository/repository/sources";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { parseSourceSnapshot } from "@bernouy/cms-repository/repository/authoring";
import { authoringFixture, sourceSnapshot } from "./fixture";

test("source snapshot builds, publishes over signed HTTP, remains private and installs an exact release", async () => {
    const f = await authoringFixture();
    try {
        const remote = new HttpCollectionRepository("local", f.base);
        const prepared = await f.authoring.prepare(sourceSnapshot());
        expect(await remote.list()).toEqual([]);
        const published = await f.authoring.publish(prepared.preparationId, prepared.digest);
        const capability = await Bun.file(
            new URL(
                "../../../../official-repository/contracts/ulvia.cms.repository/capabilities/commands/publish-collection.json",
                import.meta.url,
            ),
        ).json();
        validateSchemaValue(parseUlviaSchema(capability.output), published);
        expect(published).toMatchObject({
            kind: "collection",
            added: true,
            digest: prepared.digest,
            version: "1.0.0",
        });
        expect(await f.authoring.publish(prepared.preparationId, prepared.digest)).toMatchObject({
            added: false,
            digest: prepared.digest,
        });
        const privateSource = await f.authoring.sources("community", "sample", "1.0.0");
        expect(privateSource?.releaseDigest).toBe(prepared.digest);
        expect(parseSourceSnapshot(privateSource!.sourceJson).files).toHaveLength(5);
        const anonymous = await fetch(`${f.base}v1/source-snapshots`, {
            method: "QUERY",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ namespace: "community", collectionId: "sample", version: "1.0.0", proof: "{}" }),
        });
        expect(anonymous.status).not.toBe(200);
        const record = (await remote.list())[0]!;
        const bundle = await remote.get(record);
        const site = new CollectionStore(new MemoryCollectionStorage(), f.contracts);
        const artifact = await site.admitRelease(bundle.release, bundle.assets);
        expect(artifact.digest).toBe(prepared.digest);
        await site.importAdmittedRelease(artifact);
        expect((await site.snapshot("site")).collections).toHaveLength(0);
        const installed = await site.install("site", artifact.digest, 0, "local");
        expect(installed.collections[0]!.release.version).toBe("1.0.0");
        const next = await f.authoring.prepare(sourceSnapshot("1.1.0"));
        await f.authoring.publish(next.preparationId, next.digest);
        const updated = await remote.get((await remote.list()).find((release) => release.version === "1.1.0")!);
        const admitted = await site.admitRelease(updated.release, updated.assets);
        await site.importAdmittedRelease(admitted);
        expect(
            (await site.upgrade("site", admitted.digest, installed.revision, "local")).collections[0]!.release.version,
        ).toBe("1.1.0");
        await expect(
            new RepositorySourceClient(f.base, { ...f.credential, resolvePrivateKey: async () => "invalid key" }).get(
                "sample",
                "1.0.0",
            ),
        ).rejects.toThrow();
    } finally {
        await f.close();
    }
});

test("changed preparations and foreign publishers fail before any release becomes visible", async () => {
    const f = await authoringFixture();
    try {
        const remote = new HttpCollectionRepository("local", f.base);
        const prepared = await f.authoring.prepare(sourceSnapshot());
        await writeFile(
            join(f.root, "preparations", prepared.preparationId, "sample/blocs/sample-panel/style.css"),
            ":scope { display: grid; }",
        );
        await expect(f.authoring.publish(prepared.preparationId, prepared.digest)).rejects.toThrow("digest changed");
        const foreign = await f.authoring.prepare(sourceSnapshot("1.0.0", "other"));
        await expect(f.authoring.publish(foreign.preparationId, foreign.digest)).rejects.toThrow("Foreign namespace");
        expect(await remote.list()).toEqual([]);
        await f.authoring.discard(prepared.preparationId);
        await expect(f.authoring.publish(prepared.preparationId, prepared.digest)).rejects.toThrow();
        for (const path of [
            "../escape",
            "/absolute",
            "assets/../escape",
            "blocs/.hidden/file",
            "blocs/sample-panel/../../escape",
            "definition.json/child",
        ]) {
            const snapshot = JSON.parse(sourceSnapshot());
            snapshot.files.push({ path, content: "unsafe" });
            await expect(f.authoring.prepare(JSON.stringify(snapshot))).rejects.toThrow();
        }
    } finally {
        await f.close();
    }
});

import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitCollectionRelease } from "@bernouy/repository/collections";
import { inlineCollectionVerifier } from "@bernouy/repository/collections/sources";
import { FilesystemRepositoryCatalogueIndex } from "../../../src/repository/filesystem/catalogueIndex";
import { FilesystemRegistryReads } from "../../../src/repository/filesystem/artifacts/registryReads";
import { LocalRepositoryYanks } from "../../../src/repository/filesystem/yanks";

async function artifact(collectionId: string, version: string) {
    return admitCollectionRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "test",
        collectionId,
        version,
        name: "name",
        locale: "en",
        translations: { en: { name: collectionId } },
        blocs: [],
        assets: [],
    });
}

test("cold latest and history pages read only requested documents, and exact lookup skips unrelated history", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-paged-collections-"));
    let validations = 0;
    const verifier = {
        ...inlineCollectionVerifier,
        metadataJson: async (...args: Parameters<typeof inlineCollectionVerifier.metadataJson>) => {
            validations++;
            return inlineCollectionVerifier.metadataJson(...args);
        },
    };
    const index = new FilesystemRepositoryCatalogueIndex(root, verifier);
    const reads = new FilesystemRegistryReads(root, index, verifier);
    try {
        // Old documents deliberately cannot parse. Discovery must not inspect their contents.
        for (let i = 0; i < 6; i++) {
            const id = `test/item-${i}`;
            const directory = join(root, "releases", "test", `item-${i}`);
            await mkdir(directory, { recursive: true });
            for (let version = 0; version < 40; version++) {
                await writeFile(join(directory, `1.0.${version}.json`), "not metadata");
            }
            await writeFile(join(directory, "1.0.40.json"), (await artifact(id, "1.0.40")).canonicalJson);
        }
        const input = { kind: "collection" as const, limit: 2, channel: "stable" as const, latestPerResource: true };
        const first = await reads.catalogue(input);
        expect(first.releases.map(({ version }) => version)).toEqual(["1.0.40", "1.0.40"]);
        expect(validations).toBe(2);
        const second = await reads.catalogue({ ...input, cursor: first.nextCursor });
        expect(second.releases).toHaveLength(2);
        expect(validations).toBe(4);
        await reads.catalogue(input);
        expect(validations).toBe(4);
        const historical = await artifact("test/item-0", "1.0.39");
        await writeFile(join(root, "releases/test/item-0/1.0.39.json"), historical.canonicalJson);
        const exact = await reads.catalogue({
            kind: "collection",
            id: "test/item-0",
            publisherId: "test",
            version: "1.0.39",
            limit: 1,
        });
        expect(exact.releases[0]!.digest).toBe(historical.digest);
        expect(validations).toBe(5);
        for (const version of ["1.0.0", "1.0.1"]) {
            await writeFile(
                join(root, `releases/test/item-0/${version}.json`),
                (await artifact("test/item-0", version)).canonicalJson,
            );
        }
        const history = await reads.catalogue({ kind: "collection", id: "test/item-0", publisherId: "test", limit: 2 });
        expect(history.releases.map((item) => item.version)).toEqual(["1.0.0", "1.0.1"]);
        expect(history.nextCursor).toBeDefined();
        expect(validations).toBe(7);
        const yanks = new LocalRepositoryYanks(root);
        await yanks.set("collection", "test", "test/item-0", "1.0.40", "Review pending");
        index.invalidate();
        expect((await reads.catalogue(input)).releases[0]!.version).toBe("1.0.39");
        expect(
            (
                await reads.catalogue({
                    ...input,
                    id: "test/item-0",
                    latestPerResource: false,
                    limit: 1,
                    version: "1.0.40",
                })
            ).releases,
        ).toEqual([]);
        const canceled = new AbortController();
        canceled.abort();
        await expect(reads.catalogue(input, canceled.signal)).rejects.toMatchObject({ name: "AbortError" });
        expect((await reads.catalogue({ kind: "collection", id: "../outside", limit: 1 })).releases).toEqual([]);
        expect(
            (await reads.catalogue({ kind: "collection", id: "test/item-0", publisherId: "foreign", limit: 1 }))
                .releases,
        ).toEqual([]);
        expect(validations).toBe(7);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

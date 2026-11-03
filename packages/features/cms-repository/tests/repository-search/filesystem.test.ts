import { FilesystemRepositorySearchSource } from "@bernouy/cms-repository/repository/search/filesystem";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { admitCollectionRelease } from "@bernouy/cms-repository/collections";
import {
    FilesystemRepositoryCatalogueIndex,
    LocalCollectionRepository,
    LocalRepositoryYanks,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositorySearch } from "@bernouy/cms-repository/repository/search";
import { collectionDocument } from "../collections/fixtures";

test("filesystem discovery reuses snapshots, omits hidden Blocs, and invalidates after publication or yank", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-search-"));
    const index = new FilesystemRepositoryCatalogueIndex(root);
    const source = new FilesystemRepositorySearchSource(root, index);
    const service = new RepositorySearch(source);
    try {
        const document = collectionDocument();
        (document.blocs as { catalogue: string }[])[0]!.catalogue = "hidden";
        const artifact = await admitCollectionRelease(document);
        await new LocalCollectionRepository(root).store(artifact);
        const first = await source.load();
        expect(await source.load()).toBe(first);
        expect(first.rows.filter((row) => row.blocId)).toHaveLength(1);
        expect((await service.search({ query: "atlas-page" })).results[0]?.blocId).toBe("atlas-page");
        await new LocalRepositoryYanks(root).set("collection", "atlas.official", "atlas", "1.0.0", "Withdrawn");
        index.invalidate();
        expect((await service.search({ query: "atlas" })).results).toEqual([]);
        const hidden = structuredClone(document);
        hidden.version = "1.0.1";
        (hidden.blocs as { catalogue: string }[])[0]!.catalogue = "hidden";
        await new LocalCollectionRepository(root).store(await admitCollectionRelease(hidden));
        index.invalidate();
        const updated = await source.load();
        expect(updated.revision).not.toBe(first.revision);
        expect(updated.rows.filter((row) => row.blocId)).toHaveLength(1);
        expect(
            (await service.search({ query: "atlas-panel", kinds: ["bloc"] })).results.some(
                (row) => row.blocId === "atlas-panel",
            ),
        ).toBe(false);
    } finally {
        await service.close();
        await rm(root, { recursive: true, force: true });
    }
});

test("the filesystem search snapshot omits historical rows while exact historical reads remain available", async () => {
    const root = await mkdtemp(join(tmpdir(), "repository-latest-corpus-"));
    const repository = new LocalCollectionRepository(root);
    try {
        const document = collectionDocument();
        await repository.store(await admitCollectionRelease(document));
        await repository.store(await admitCollectionRelease({ ...document, version: "1.0.1" }));
        const snapshot = await new FilesystemRepositorySearchSource(
            root,
            new FilesystemRepositoryCatalogueIndex(root),
        ).load();
        expect(snapshot.rows).toHaveLength(3);
        expect(snapshot.rows.every((row) => row.reference.version === "1.0.1")).toBe(true);
        expect(await repository.getMetadata("atlas.official", "atlas", "1.0.0")).not.toBeNull();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

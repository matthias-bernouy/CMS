import { describe, expect, test } from "bun:test";
import { createMongoFilesRepository } from "./filesMongoFixture";

describe("MongoCmsFilesMetadata queries", () => {
    test("uses the configured collection and initializes the sibling-name index", async () => {
        const { collection, repository, requestedNames } = createMongoFilesRepository("tenant_");

        await repository.init();

        expect(collection.indexes).toEqual([{ keys: { parentId: 1, name: 1 }, options: { unique: true } }]);
        expect(requestedNames).toEqual(["tenant_filesMeta"]);
    });

    test("filters, sorts, and paginates direct children", async () => {
        const { repository } = createMongoFilesRepository();
        const images = await repository.createFolder({ name: "images", parentId: null });
        await repository.createFile({
            name: "zebra.png",
            parentId: images.id,
            size: 20,
            mimeType: "image/png",
        });
        await repository.createFile({
            name: "Alpha.png",
            parentId: images.id,
            size: 10,
            mimeType: "image/png",
        });
        await repository.createFolder({ name: "archive", parentId: images.id });

        const page = await repository.listChildren(images.id, {
            accept: ["file"],
            search: ".png",
            sortBy: "size",
            sortOrder: "desc",
            pagination: { page: 1, limit: 1 },
        });

        expect(page).toMatchObject({ total: 2, page: 1, limit: 1, hasMore: true });
        expect(page.items.map((item) => item.name)).toEqual(["zebra.png"]);
    });

    test("resolves readable paths and recursively lists descendants", async () => {
        const { repository } = createMongoFilesRepository();
        const images = await repository.createFolder({ name: "images", parentId: null });
        const archive = await repository.createFolder({ name: "archive", parentId: images.id });
        const hero = await repository.createFile({
            name: "hero.png",
            parentId: archive.id,
            size: 12,
            mimeType: "image/png",
            contentHash: "hash-1",
        });

        expect(await repository.getItem(hero.id)).toMatchObject({ id: hero.id, contentHash: "hash-1" });
        expect(await repository.getItemByPath(" /images/archive/hero.png/ ")).toMatchObject({ id: hero.id });
        expect(await repository.getItemByPath("images/missing.png")).toBeNull();
        expect((await repository.listSubtree(images.id)).map((item) => item.id)).toEqual([archive.id, hero.id]);
    });
});

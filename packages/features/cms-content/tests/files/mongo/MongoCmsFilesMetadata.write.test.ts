import { describe, expect, test } from "bun:test";
import { createMongoFilesRepository } from "./filesMongoFixture";

describe("MongoCmsFilesMetadata mutations", () => {
    test("validates parents and translates sibling name clashes", async () => {
        const { repository } = createMongoFilesRepository();
        const images = await repository.createFolder({ name: "images", parentId: null });

        await expect(repository.createFolder({ name: "images", parentId: null })).rejects.toThrow(/already exists/);
        await expect(repository.createFolder({ name: "orphan", parentId: "missing" })).rejects.toThrow(
            /destination folder not found/,
        );
        await expect(
            repository.createFile({ name: "nested.png", parentId: images.id, size: 1, mimeType: "image/png" }),
        ).resolves.toMatchObject({ name: "nested.png", parentId: images.id });
    });

    test("upserts caller ids and updates only mutable content fields", async () => {
        const { repository } = createMongoFilesRepository();
        const first = await repository.createFile({
            id: "stable-id",
            name: "hero.png",
            parentId: null,
            size: 1,
            mimeType: "image/png",
            contentHash: "hash-1",
        });
        const upserted = await repository.createFile({
            id: "stable-id",
            name: "hero.png",
            parentId: null,
            size: 2,
            mimeType: "image/webp",
            contentHash: "hash-2",
        });

        expect(upserted).toMatchObject({ id: "stable-id", size: 2, contentHash: "hash-2" });
        expect(upserted.createdAt).toEqual(first.createdAt);
        expect((await repository.listChildren(null)).total).toBe(1);

        const updated = await repository.updateFileContent("stable-id", {
            size: 3,
            mimeType: "image/avif",
            contentHash: "hash-3",
        });
        expect(updated).toMatchObject({ name: "hero.png", size: 3, contentHash: "hash-3" });
        expect(await repository.updateFileContent("missing", { size: 1, mimeType: "x", contentHash: "x" })).toBeNull();
    });

    test("moves folders only outside their own subtree", async () => {
        const { repository } = createMongoFilesRepository();
        const images = await repository.createFolder({ name: "images", parentId: null });
        const archive = await repository.createFolder({ name: "archive", parentId: images.id });

        expect(await repository.updateItem("missing", { name: "unused" })).toBeNull();
        await expect(repository.updateItem(images.id, { parentId: archive.id })).rejects.toThrow(/own subtree/);
        expect(await repository.updateItem(archive.id, { name: "old" })).toMatchObject({
            id: archive.id,
            name: "old",
        });
        expect(await repository.getItemByPath("images/old")).toMatchObject({ id: archive.id });
    });

    test("requires recursive folder deletion and reports removed blob ids", async () => {
        const { repository } = createMongoFilesRepository();
        const images = await repository.createFolder({ name: "images", parentId: null });
        const hero = await repository.createFile({
            name: "hero.png",
            parentId: images.id,
            size: 1,
            mimeType: "image/png",
        });

        await expect(repository.deleteItem(images.id)).rejects.toThrow(/folder not empty/);
        expect(await repository.deleteItem(images.id, { recursive: true })).toEqual({ deletedFileIds: [hero.id] });
        expect(await repository.getItem(images.id)).toBeNull();
        expect(await repository.deleteItem("missing")).toEqual({ deletedFileIds: [] });
    });
});

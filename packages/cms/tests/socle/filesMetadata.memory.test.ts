import { describe, test, expect } from "bun:test";
import { InMemoryCmsFilesMetadata } from "src/socle/default-implementation/CmsFilesMetadata/memory";

describe("InMemoryCmsFilesMetadata", () => {
    test("creates a tree and lists children of root and folders", async () => {
        const repo = new InMemoryCmsFilesMetadata();
        const images = await repo.createFolder({ name: "images", parentId: null });
        await repo.createFile({ name: "hero.png", parentId: images.id, size: 12, mimeType: "image/png" });

        const root = await repo.listChildren(null);
        expect(root.items.map(i => i.name)).toEqual(["images"]);

        const inImages = await repo.listChildren(images.id);
        expect(inImages.total).toBe(1);
        expect(inImages.items[0]!.name).toBe("hero.png");
    });

    test("rejects a name clash among siblings", async () => {
        const repo = new InMemoryCmsFilesMetadata();
        await repo.createFolder({ name: "images", parentId: null });
        await expect(repo.createFolder({ name: "images", parentId: null })).rejects.toThrow(/already exists/);
    });

    test("resolves a readable path to its item (id stays stable)", async () => {
        const repo = new InMemoryCmsFilesMetadata();
        const images = await repo.createFolder({ name: "images", parentId: null });
        const hero = await repo.createFile({ name: "hero.png", parentId: images.id, size: 1, mimeType: "image/png" });

        const found = await repo.getItemByPath("images/hero.png");
        expect(found?.id).toBe(hero.id);
        expect(await repo.getItemByPath("images/missing.png")).toBeNull();
    });

    test("rename / move never changes the id; move into own subtree is rejected", async () => {
        const repo = new InMemoryCmsFilesMetadata();
        const images = await repo.createFolder({ name: "images", parentId: null });
        const sub = await repo.createFolder({ name: "sub", parentId: images.id });

        const renamed = await repo.updateItem(images.id, { name: "archive" });
        expect(renamed?.id).toBe(images.id);
        expect((await repo.getItemByPath("archive/sub"))?.id).toBe(sub.id);

        await expect(repo.updateItem(images.id, { parentId: sub.id })).rejects.toThrow(/own subtree/);
    });

    test("recursive delete removes the subtree and returns the deleted file ids", async () => {
        const repo = new InMemoryCmsFilesMetadata();
        const images = await repo.createFolder({ name: "images", parentId: null });
        const a = await repo.createFile({ name: "a.png", parentId: images.id, size: 1, mimeType: "image/png" });
        const sub = await repo.createFolder({ name: "sub", parentId: images.id });
        const b = await repo.createFile({ name: "b.png", parentId: sub.id, size: 1, mimeType: "image/png" });

        await expect(repo.deleteItem(images.id)).rejects.toThrow(/not empty/);

        const res = await repo.deleteItem(images.id, { recursive: true });
        expect(res.deletedFileIds.sort()).toEqual([a.id, b.id].sort());
        expect(await repo.getItem(sub.id)).toBeNull();
        expect((await repo.listChildren(null)).total).toBe(0);
    });
});

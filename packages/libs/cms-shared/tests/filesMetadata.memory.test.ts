import { describe, test, expect } from "bun:test";
import { InMemoryCmsFilesMetadata } from "@bernouy/cms-shared";

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

    test("createFile stores contentHash and getItem returns it", async () => {
        const repo = new InMemoryCmsFilesMetadata();
        const f = await repo.createFile({ name: "a.png", parentId: null, size: 3, mimeType: "image/png", contentHash: "deadbeef" });
        expect(f.contentHash).toBe("deadbeef");
        expect((await repo.getItem(f.id))?.type === "file" ? (await repo.getItem(f.id) as { contentHash?: string }).contentHash : undefined).toBe("deadbeef");
    });

    test("updateFileContent refreshes content fields, keeps name/parentId; null for unknown/folder", async () => {
        const repo = new InMemoryCmsFilesMetadata();
        const dir = await repo.createFolder({ name: "d", parentId: null });
        const f = await repo.createFile({ name: "a.png", parentId: dir.id, size: 1, mimeType: "image/png", contentHash: "h1" });
        const u = await repo.updateFileContent(f.id, { size: 9, mimeType: "image/webp", contentHash: "h2" });
        expect(u?.name).toBe("a.png");          // preserved
        expect(u?.parentId).toBe(dir.id);        // preserved
        expect(u?.size).toBe(9);
        expect(u?.mimeType).toBe("image/webp");
        expect(u?.contentHash).toBe("h2");
        expect(await repo.updateFileContent("nope", { size: 1, mimeType: "x", contentHash: "h" })).toBeNull();
        expect(await repo.updateFileContent(dir.id, { size: 1, mimeType: "x", contentHash: "h" })).toBeNull(); // a folder
    });

    test("createFile honors a caller-supplied id", async () => {
        const repo = new InMemoryCmsFilesMetadata();
        const f = await repo.createFile({ name: "hero.png", parentId: null, size: 1, mimeType: "image/png", id: "fixed-id" });
        expect(f.id).toBe("fixed-id");
        expect((await repo.getItem("fixed-id"))?.name).toBe("hero.png");
    });

    test("a supplied id UPSERTS: re-creating the same id updates in place, not a duplicate", async () => {
        const repo = new InMemoryCmsFilesMetadata();
        const a = await repo.createFile({ name: "hero.png", parentId: null, size: 1, mimeType: "image/png", id: "fixed-id" });
        const b = await repo.createFile({ name: "hero.png", parentId: null, size: 999, mimeType: "image/png", id: "fixed-id" });
        expect(b.id).toBe("fixed-id");
        expect(b.size).toBe(999);                               // updated
        expect(b.createdAt).toEqual(a.createdAt);               // preserved across the upsert
        expect((await repo.listChildren(null)).total).toBe(1);  // no duplicate row
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

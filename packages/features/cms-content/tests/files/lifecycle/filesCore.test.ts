import { describe, test, expect } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { InMemoryCmsFilesMetadata } from "@bernouy/cms-content/files";
import { uploadFile } from "@bernouy/cms-content/files";
import { deleteFileTree } from "@bernouy/cms-content/files";

const file = (name: string, content: string, type = "text/plain") => new File([content], name, { type });
const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("files core (metadata + blob)", () => {
    test("uploadFile creates the record and stores the bytes under its id", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const item = await uploadFile(meta, blob, new File([pngHeader], "hero.png", { type: "image/png" }), null);
        expect(item.type).toBe("file");
        expect(item.size).toBe(8);
        expect(item.mimeType).toBe("image/png");
        expect(await blob.exists(item.id)).toBe(true);
        expect((await meta.getItem(item.id))?.name).toBe("hero.png");
    });

    test("uploadFile rejects a known binary type whose bytes do not match", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        await expect(uploadFile(meta, blob, file("fake.png", "not a png", "image/png"), null)).rejects.toMatchObject({
            status: 415,
        });
        expect((await meta.listChildren(null)).total).toBe(0);
    });

    test("deleteFileTree removes metadata and purges the bytes", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        const folder = await meta.createFolder({ name: "images", parentId: null });
        const a = await uploadFile(meta, blob, file("a.png", "x"), folder.id);

        const res = await deleteFileTree(meta, blob, folder.id, true);
        expect(res.deletedFileIds).toContain(a.id);
        expect(await blob.exists(a.id)).toBe(false);
        expect(await meta.getItem(folder.id)).toBeNull();
    });

    test("uploadFile rolls back the metadata when the blob write fails", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const blob = new MemoryBlobStore();
        blob.put = async () => {
            throw new Error("disk full");
        };
        await expect(uploadFile(meta, blob, file("x.png", "y"), null)).rejects.toThrow("disk full");
        expect((await meta.listChildren(null)).total).toBe(0); // rolled back
    });
});

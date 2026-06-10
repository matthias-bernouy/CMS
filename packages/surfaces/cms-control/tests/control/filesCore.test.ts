import { describe, test, expect } from "bun:test";
import { InMemoryCmsFilesMetadata } from "@bernouy/cms-files";
import { InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import { uploadFile } from "@bernouy/cms-files";
import { deleteFileTree } from "@bernouy/cms-files";

const file = (name: string, content: string, type = "text/plain") => new File([content], name, { type });

describe("files core (metadata + blob)", () => {
    test("uploadFile creates the record and stores the bytes under its id", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        const item = await uploadFile(meta, blob, file("hero.png", "PNGDATA", "image/png"), null);
        expect(item.type).toBe("file");
        expect(item.size).toBe(7);
        expect(item.mimeType).toBe("image/png");
        expect(await blob.exists(item.id)).toBe(true);
        expect((await meta.getItem(item.id))?.name).toBe("hero.png");
    });

    test("deleteFileTree removes metadata and purges the bytes", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        const folder = await meta.createFolder({ name: "images", parentId: null });
        const a = await uploadFile(meta, blob, file("a.png", "x"), folder.id);

        const res = await deleteFileTree(meta, blob, folder.id, true);
        expect(res.deletedFileIds).toContain(a.id);
        expect(await blob.exists(a.id)).toBe(false);
        expect(await meta.getItem(folder.id)).toBeNull();
    });

    test("uploadFile rolls back the metadata when the blob write fails", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        blob.put = async () => { throw new Error("disk full"); };
        await expect(uploadFile(meta, blob, file("x.png", "y"), null)).rejects.toThrow("disk full");
        expect((await meta.listChildren(null)).total).toBe(0); // rolled back
    });
});

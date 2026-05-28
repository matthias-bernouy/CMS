import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsCmsFiles } from "@bernouy/cms-shared";
import { uploadFile } from "src/control/core/files/uploadFile";
import { deleteFileTree } from "src/control/core/files/deleteFileTree";

const file = (name: string, content: string, type = "text/plain") => new File([content], name, { type });
const read = async (s: ReadableStream<Uint8Array> | null) => s ? await new Response(s).text() : null;

describe("LocalFsCmsFiles (filesystem-native, id = path)", () => {
    let root: string;
    let fs: LocalFsCmsFiles;
    beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "p9r-files-")); fs = new LocalFsCmsFiles(root); });
    afterEach(async () => { await rm(root, { recursive: true, force: true }); });

    test("folder = directory, file = filename, id = relative path", async () => {
        const images = await fs.createFolder({ name: "images", parentId: null });
        expect(images.id).toBe("images");
        const hero = await uploadFile(fs, fs, file("hero.png", "PNGDATA", "image/png"), images.id);
        expect(hero.id).toBe("images/hero.png");

        const inImages = await fs.listChildren("images");
        expect(inImages.items.map(i => i.name)).toEqual(["hero.png"]);
        expect(await read(await fs.get("images/hero.png"))).toBe("PNGDATA");
        expect((await fs.getItemByPath("images/hero.png"))?.id).toBe(hero.id);
    });

    test("mimeType + size are derived from disk", async () => {
        await uploadFile(fs, fs, file("a.png", "1234", "image/png"), null);
        const item = await fs.getItemByPath("a.png");
        expect(item?.type).toBe("file");
        expect(item && item.type === "file" ? item.size : 0).toBe(4);
        expect(item && item.type === "file" ? item.mimeType : "").toContain("image/png");
    });

    test("rename changes the id (path) but keeps the content", async () => {
        const dir = await fs.createFolder({ name: "images", parentId: null });
        await uploadFile(fs, fs, file("hero.png", "DATA"), dir.id);
        await fs.updateItem(dir.id, { name: "archive" });
        expect(await fs.getItemByPath("images/hero.png")).toBeNull();
        expect(await read(await fs.get("archive/hero.png"))).toBe("DATA");
    });

    test("recursive delete removes the subtree and reports the file ids", async () => {
        const dir = await fs.createFolder({ name: "images", parentId: null });
        const a = await uploadFile(fs, fs, file("a.png", "x"), dir.id);
        await expect(fs.deleteItem(dir.id)).rejects.toThrow(/not empty/);
        const res = await deleteFileTree(fs, fs, dir.id, true);
        expect(res.deletedFileIds).toContain(a.id);
        expect((await fs.listChildren(null)).total).toBe(0);
    });
});

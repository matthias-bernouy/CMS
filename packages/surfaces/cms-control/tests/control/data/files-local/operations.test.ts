import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, rename, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    LocalFsCmsFiles,
    sha256Hex,
    InMemoryCmsFilesMetadata,
    InMemoryCmsFilesBlob,
    type FileItem,
} from "@bernouy/cms-files";
import { uploadFile } from "@bernouy/cms-files";
import { updateFileContent } from "@bernouy/cms-files";
import { deleteFileTree } from "@bernouy/cms-files";

const file = (name: string, content: string, type = "text/plain") => new File([content], name, { type });
const read = async (s: ReadableStream<Uint8Array> | null) => (s ? await new Response(s).text() : null);

/** The store lives at `<site>/files`; its registry is the sibling `<site>/.cms-files-registry.json`. */
describe("LocalFsCmsFiles (filesystem-native, uuid id + registry)", () => {
    let site: string;
    let root: string;
    let fs: LocalFsCmsFiles;
    const registryPath = () => join(site, ".cms-files-registry.json");
    const registry = async () =>
        JSON.parse(await readFile(registryPath(), "utf8")) as {
            byId: Record<string, { path: string; hash: string | null }>;
            byPath: Record<string, string>;
        };
    const isUuid = (s: string) => !s.includes("/");

    beforeEach(async () => {
        site = await mkdtemp(join(tmpdir(), "p9r-site-"));
        root = join(site, "files");
        await mkdir(root);
        fs = new LocalFsCmsFiles(root);
    });
    afterEach(async () => {
        await rm(site, { recursive: true, force: true });
    });

    test("folder = directory, file = filename, id is an opaque uuid", async () => {
        const images = await fs.createFolder({ name: "images", parentId: null });
        expect(isUuid(images.id)).toBe(true);
        const hero = await uploadFile(fs, fs, file("hero.png", "PNGDATA", "image/png"), images.id);
        expect(isUuid(hero.id)).toBe(true);
        expect(hero.id).not.toBe(images.id);

        const inImages = await fs.listChildren(images.id);
        expect(inImages.items.map((i) => i.name)).toEqual(["hero.png"]);
        expect(await read(await fs.get(hero.id))).toBe("PNGDATA");
        expect((await fs.getItemByPath("images/hero.png"))?.id).toBe(hero.id);
    });

    test("mimeType + size are derived from disk", async () => {
        const a = await uploadFile(fs, fs, file("a.png", "1234", "image/png"), null);
        const item = await fs.getItem(a.id);
        expect(item?.type).toBe("file");
        expect(item && item.type === "file" ? item.size : 0).toBe(4);
        expect(item && item.type === "file" ? item.mimeType : "").toContain("image/png");
    });

    test("rename KEEPS the id; only the path changes", async () => {
        const dir = await fs.createFolder({ name: "images", parentId: null });
        const hero = await uploadFile(fs, fs, file("hero.png", "DATA"), dir.id);
        await fs.updateItem(dir.id, { name: "archive" });

        expect(await fs.getItemByPath("images/hero.png")).toBeNull();
        expect((await fs.getItem(dir.id))?.name).toBe("archive"); // same uuid, new name
        expect((await fs.getItem(hero.id))?.id).toBe(hero.id); // file uuid preserved through folder rename
        expect(await read(await fs.get(hero.id))).toBe("DATA");
    });

    test("uploadFile computes the contentHash (= sha256 of the bytes) and stores it", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        const expected = sha256Hex(new TextEncoder().encode("PNGDATA"));
        const f = await uploadFile(meta, blob, file("a.png", "PNGDATA", "image/png"), null);
        expect(f.contentHash).toBe(expected);
        expect(((await meta.getItem(f.id)) as FileItem).contentHash).toBe(expected);
    });

    test("localFs derives contentHash from disk (registry hash)", async () => {
        const f = await uploadFile(fs, fs, file("hero.png", "DATA"), null);
        const item = await fs.getItem(f.id);
        expect(item && item.type === "file" ? item.contentHash : null).toBe(
            sha256Hex(new TextEncoder().encode("DATA")),
        );
    });

    test("updateFileContent swaps bytes in place: same id + name, refreshed hash (memory store)", async () => {
        const meta = new InMemoryCmsFilesMetadata();
        const blob = new InMemoryCmsFilesBlob();
        const f = await uploadFile(meta, blob, file("logo.png", "V1", "image/png"), null);
        const updated = await updateFileContent(meta, blob, f.id, file("ignored-name.png", "V2-longer", "image/png"));
        expect(updated?.id).toBe(f.id); // same id
        expect(updated?.name).toBe("logo.png"); // name preserved, not "ignored-name.png"
        expect(updated?.size).toBe("V2-longer".length);
        expect(updated?.contentHash).toBe(sha256Hex(new TextEncoder().encode("V2-longer")));
        expect(updated?.contentHash).not.toBe(f.contentHash);
        expect(await read(await blob.get(f.id))).toBe("V2-longer"); // bytes replaced
    });

    test("updateFileContent on localFs re-derives the hash from disk; null for unknown id", async () => {
        const f = await uploadFile(fs, fs, file("logo.png", "V1"), null);
        const updated = await updateFileContent(fs, fs, f.id, file("logo.png", "V2"));
        expect(updated?.id).toBe(f.id);
        expect(updated?.contentHash).toBe(sha256Hex(new TextEncoder().encode("V2")));
        expect(await read(await fs.get(f.id))).toBe("V2");
        expect(await updateFileContent(fs, fs, "no-such-id", file("x.png", "x"))).toBeNull();
    });

    test("createFile honors a caller-supplied id (CLI push path)", async () => {
        const f = await fs.createFile({
            name: "hero.png",
            parentId: null,
            size: 0,
            mimeType: "image/png",
            id: "given-uuid",
        });
        expect(f.id).toBe("given-uuid");
        expect((await fs.getItem("given-uuid"))?.name).toBe("hero.png");
        expect((await registry()).byPath["hero.png"]).toBe("given-uuid");
    });

    test("parentId/id symmetry: child.parentId resolves back to the folder", async () => {
        const dir = await fs.createFolder({ name: "logos", parentId: null });
        const f = await uploadFile(fs, fs, file("hero.png", "x"), dir.id);
        const child = (await fs.listChildren(dir.id)).items[0]!;
        expect(child.id).toBe(f.id);
        expect(child.parentId).toBe(dir.id);
        expect((await fs.getItem(child.parentId!))?.id).toBe(dir.id);
        // walking parentId reconstructs the path → the inverse of getItemByPath
        expect((await fs.getItemByPath("logos/hero.png"))?.id).toBe(f.id);
    });
});

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, rm, rename, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsCmsFiles, sha256Hex, pathOf } from "@bernouy/cms-shared";
import { uploadFile } from "cms-control/core/files/uploadFile";
import { deleteFileTree } from "cms-control/core/files/deleteFileTree";

const file = (name: string, content: string, type = "text/plain") => new File([content], name, { type });
const read = async (s: ReadableStream<Uint8Array> | null) => s ? await new Response(s).text() : null;

/** The store lives at `<site>/files`; its registry is the sibling `<site>/.cms-files-registry.json`. */
describe("LocalFsCmsFiles (filesystem-native, uuid id + registry)", () => {
    let site: string;
    let root: string;
    let fs: LocalFsCmsFiles;
    const registryPath = () => join(site, ".cms-files-registry.json");
    const registry = async () => JSON.parse(await readFile(registryPath(), "utf8")) as {
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
    afterEach(async () => { await rm(site, { recursive: true, force: true }); });

    test("folder = directory, file = filename, id is an opaque uuid", async () => {
        const images = await fs.createFolder({ name: "images", parentId: null });
        expect(isUuid(images.id)).toBe(true);
        const hero = await uploadFile(fs, fs, file("hero.png", "PNGDATA", "image/png"), images.id);
        expect(isUuid(hero.id)).toBe(true);
        expect(hero.id).not.toBe(images.id);

        const inImages = await fs.listChildren(images.id);
        expect(inImages.items.map(i => i.name)).toEqual(["hero.png"]);
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
        expect((await fs.getItem(dir.id))?.name).toBe("archive");   // same uuid, new name
        expect((await fs.getItem(hero.id))?.id).toBe(hero.id);       // file uuid preserved through folder rename
        expect(await read(await fs.get(hero.id))).toBe("DATA");
    });

    test("parentId/id symmetry: child.parentId resolves back to the folder", async () => {
        const dir = await fs.createFolder({ name: "logos", parentId: null });
        const f = await uploadFile(fs, fs, file("hero.png", "x"), dir.id);
        const child = (await fs.listChildren(dir.id)).items[0]!;
        expect(child.parentId).toBe(dir.id);
        expect((await fs.getItem(child.parentId!))?.id).toBe(dir.id);
        expect(await pathOf(fs, f.id)).toBe("logos/hero.png");
    });

    test("recursive delete removes the subtree and reports the file ids (uuids)", async () => {
        const dir = await fs.createFolder({ name: "images", parentId: null });
        const a = await uploadFile(fs, fs, file("a.png", "x"), dir.id);
        await expect(fs.deleteItem(dir.id)).rejects.toThrow(/not empty/);
        const res = await deleteFileTree(fs, fs, dir.id, true);
        expect(res.deletedFileIds).toContain(a.id);
        expect((await fs.listChildren(null)).total).toBe(0);
        const reg = await registry();
        expect(Object.keys(reg.byId)).toHaveLength(0);   // bijective + fully dropped
    });

    test("ids survive a reload from disk", async () => {
        const dir = await fs.createFolder({ name: "images", parentId: null });
        const hero = await uploadFile(fs, fs, file("hero.png", "DATA"), dir.id);

        const fresh = new LocalFsCmsFiles(root);
        await fresh.reconcile();
        expect((await fresh.getItem(hero.id))?.id).toBe(hero.id);
        expect(await read(await fresh.get(hero.id))).toBe("DATA");
    });

    test("put re-hashes from the bytes written to disk (not the input stream)", async () => {
        const a = await uploadFile(fs, fs, file("a.bin", "AAAA"), null);
        expect((await registry()).byId[a.id]!.hash).toBe(sha256Hex(new TextEncoder().encode("AAAA")));
        // Overwrite via a ReadableStream — Bun.write consumes it, so the hash can
        // only come from re-reading the file.
        const stream = new Response("BBBBBB").body!;
        await fs.put(a.id, stream);
        expect((await registry()).byId[a.id]!.hash).toBe(sha256Hex(new TextEncoder().encode("BBBBBB")));
    });

    test("registry stays bijective through create/rename/move/delete", async () => {
        const a = await fs.createFolder({ name: "a", parentId: null });
        const b = await fs.createFolder({ name: "b", parentId: null });
        const f = await uploadFile(fs, fs, file("x.txt", "1"), a.id);
        await fs.updateItem(f.id, { parentId: b.id });     // move file a → b
        await fs.updateItem(a.id, { name: "a2" });          // rename empty folder
        const reg = await registry();
        for (const [uuid, e] of Object.entries(reg.byId)) expect(reg.byPath[e.path]).toBe(uuid);
        for (const [path, uuid] of Object.entries(reg.byPath)) expect(reg.byId[uuid]!.path).toBe(path);
        expect(await read(await fs.get(f.id))).toBe("1");
    });

    describe("reconcile (self-healing)", () => {
        test("heals a pure IDE move/rename by hash, preserving the uuid", async () => {
            await fs.createFolder({ name: "images", parentId: null });
            const hero = await uploadFile(fs, fs, file("hero.png", "DATA"), (await fs.getItemByPath("images"))!.id);
            await rename(join(root, "images/hero.png"), join(root, "images/renamed.png")); // bypass the API

            const r = await new LocalFsCmsFiles(root).reconcile();
            expect(r.healed.map(h => h.uuid)).toContain(hero.id);
            expect(r.minted).toHaveLength(0);
            expect((await registry()).byPath["images/renamed.png"]).toBe(hero.id);
        });

        test("move+edit mints a new id and orphans the old one", async () => {
            const orig = await uploadFile(fs, fs, file("a.txt", "ORIGINAL"), null);
            await rm(join(root, "a.txt"));
            await writeFile(join(root, "b.txt"), "EDITED");   // different bytes, unknown path

            const r = await new LocalFsCmsFiles(root).reconcile();
            expect(r.deleted.map(d => d.uuid)).toContain(orig.id);
            expect(r.minted.some(m => m.path === "b.txt")).toBe(true);
            expect(r.healed).toHaveLength(0);
        });

        test("a copy keeps the original and mints a new id for the duplicate", async () => {
            const orig = await uploadFile(fs, fs, file("a.txt", "SAME"), null);
            await writeFile(join(root, "copy.txt"), "SAME");  // identical bytes, original still present

            const r = await new LocalFsCmsFiles(root).reconcile();
            expect(r.healed).toHaveLength(0);
            expect(r.minted.some(m => m.path === "copy.txt")).toBe(true);
            const reg = await registry();
            expect(reg.byPath["a.txt"]).toBe(orig.id);        // original untouched
            expect(reg.byPath["copy.txt"]).not.toBe(orig.id);
        });

        test("in-place edit refreshes the hash but keeps the uuid; second run is a no-op", async () => {
            const a = await uploadFile(fs, fs, file("a.txt", "V1"), null);
            await writeFile(join(root, "a.txt"), "V2");       // edit in place, same path

            const r1 = await new LocalFsCmsFiles(root).reconcile();
            expect(r1.healed).toHaveLength(0);
            expect(r1.minted).toHaveLength(0);
            expect((await registry()).byPath["a.txt"]).toBe(a.id);
            expect((await registry()).byId[a.id]!.hash).toBe(sha256Hex(new TextEncoder().encode("V2")));

            const r2 = await new LocalFsCmsFiles(root).reconcile();   // idempotent
            expect(r2).toEqual({ healed: [], minted: [], deleted: [], errors: [] });
        });

        test("deletes a registry entry whose file is gone", async () => {
            const a = await uploadFile(fs, fs, file("gone.txt", "x"), null);
            await rm(join(root, "gone.txt"));
            const r = await new LocalFsCmsFiles(root).reconcile();
            expect(r.deleted.map(d => d.uuid)).toContain(a.id);
            expect((await registry()).byId[a.id]).toBeUndefined();
        });

        test("folder rename preserves every descendant uuid", async () => {
            const dir = await fs.createFolder({ name: "images", parentId: null });
            const hero = await uploadFile(fs, fs, file("hero.png", "DATA"), dir.id);
            await rename(join(root, "images"), join(root, "photos"));  // out-of-band folder move

            await new LocalFsCmsFiles(root).reconcile();
            const reg = await registry();
            expect(reg.byPath["photos/hero.png"]).toBe(hero.id);       // file uuid healed by content
        });
    });

    test("a corrupt registry makes reconcile throw; an absent one is fine", async () => {
        await uploadFile(fs, fs, file("a.txt", "x"), null);    // writes a valid registry
        await writeFile(registryPath(), "{ not json");
        await expect(new LocalFsCmsFiles(root).reconcile()).rejects.toThrow(/Corrupt files registry/);
        await rm(registryPath());
        await expect(new LocalFsCmsFiles(root).reconcile()).resolves.toBeDefined();
    });
});

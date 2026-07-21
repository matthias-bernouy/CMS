import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalFsCmsFiles } from "@bernouy/cms-files";

let tmp: string;

beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "cms-files-localfs-"));
});

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
});

describe("LocalFsCmsFiles contract", () => {
    test("metadata tree operations keep stable ids across rename and move", async () => {
        const store = new LocalFsCmsFiles(join(tmp, "files"));
        const images = await store.createFolder({ name: "images", parentId: null });
        const hero = await store.createFile({ name: "hero.png", parentId: images.id, size: 0, mimeType: "image/png" });

        expect((await store.getItemByPath("images/hero.png"))?.id).toBe(hero.id);

        const renamed = await store.updateItem(images.id, { name: "archive" });
        expect(renamed?.id).toBe(images.id);
        expect((await store.getItemByPath("archive/hero.png"))?.id).toBe(hero.id);

        const moved = await store.updateItem(hero.id, { parentId: null });
        expect(moved?.id).toBe(hero.id);
        expect((await store.getItemByPath("hero.png"))?.id).toBe(hero.id);
        expect(await store.getItemByPath("archive/hero.png")).toBeNull();
    });

    test("blob operations store bytes behind file ids and refresh metadata content", async () => {
        const store = new LocalFsCmsFiles(join(tmp, "files"));
        const file = await store.createFile({ name: "a.txt", parentId: null, size: 0, mimeType: "text/plain" });

        await store.put(file.id, bytes("hello"));
        expect(await read(await store.get(file.id))).toEqual(bytes("hello"));
        expect(await store.exists(file.id)).toBe(true);

        const refreshed = await store.updateFileContent(file.id, {
            size: 5,
            mimeType: "text/plain",
            contentHash: "ignored",
        });
        expect(refreshed?.size).toBe(5);
        expect(refreshed?.contentHash).toMatch(/^[a-f0-9]{64}$/);

        await store.delete(file.id);
        expect(await store.exists(file.id)).toBe(false);
        expect(await store.get(file.id)).toBeNull();
    });
});

const bytes = (value: string) => new TextEncoder().encode(value);

async function read(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array | null> {
    return stream ? new Uint8Array(await new Response(stream).arrayBuffer()) : null;
}

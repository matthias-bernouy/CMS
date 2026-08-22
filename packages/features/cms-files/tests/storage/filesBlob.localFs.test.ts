import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsCmsFilesBlob } from "@bernouy/cms-files";

let directory: string;

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "cms-files-blob-"));
});

afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
});

describe("LocalFsCmsFilesBlob", () => {
    test("atomically replaces a blob without retaining its staging file", async () => {
        const store = new LocalFsCmsFilesBlob(directory);
        await store.put("manifest", new TextEncoder().encode("before"));
        await store.put("manifest", new TextEncoder().encode("after"));

        const stream = await store.get("manifest");
        expect(await new Response(stream).text()).toBe("after");
        expect(await readdir(directory)).toEqual(["manifest"]);
    });
});

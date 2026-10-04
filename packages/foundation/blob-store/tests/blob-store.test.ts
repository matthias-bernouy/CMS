import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsBlobStore } from "../src/adapters/LocalFsBlobStore";
import { MemoryBlobStore } from "../src/adapters/MemoryBlobStore";
import { S3BlobStore } from "../src/adapters/S3BlobStore";

const bytes = (value: string) => new TextEncoder().encode(value);
const read = async (stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array | null> =>
    stream ? new Uint8Array(await new Response(stream).arrayBuffer()) : null;

describe("MemoryBlobStore", () => {
    test("owns writes and supports inclusive byte ranges", async () => {
        const store = new MemoryBlobStore();
        const input = new Uint8Array([1, 2, 3, 4]);
        await store.put("tenant/file", input);
        input[1] = 9;
        expect(await store.head("tenant/file")).toEqual({ size: 4 });
        const stream = await store.get("tenant/file", { range: { start: 1, end: 2 } });
        expect([...new Uint8Array(await new Response(stream).arrayBuffer())]).toEqual([2, 3]);
    });

    test("overwrites, deletes idempotently, and accepts streams", async () => {
        const store = new MemoryBlobStore();
        await store.put("value", bytes("one"));
        const result = await store.put("value", new Response(bytes("streamed")).body!);
        expect(result).toEqual({ size: 8 });
        expect(await read(await store.get("value"))).toEqual(bytes("streamed"));
        await store.delete("value");
        await store.delete("value");
        expect(await store.exists("value")).toBe(false);
    });

    test("rejects traversal keys and invalid ranges", async () => {
        const store = new MemoryBlobStore();
        expect(store.put("../escape", new Uint8Array())).rejects.toBeInstanceOf(TypeError);
        await expect(store.put("valid..name/file", new Uint8Array())).resolves.toEqual({ size: 0 });
        await store.put("value", new Uint8Array([1]));
        expect(store.get("value", { range: { start: 1, end: 1 } })).rejects.toBeInstanceOf(RangeError);
    });
});

describe("LocalFsBlobStore", () => {
    let directory: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "blob-store-"));
    });

    afterEach(async () => {
        await rm(directory, { force: true, recursive: true });
    });

    test("atomically replaces a blob without retaining its staging file", async () => {
        const store = new LocalFsBlobStore(directory);
        await store.put("manifest", bytes("before"));
        await store.put("manifest", bytes("after"));
        expect(await new Response(await store.get("manifest")).text()).toBe("after");
        expect(await readdir(directory)).toEqual(["manifest"]);
    });
});

describe("S3BlobStore", () => {
    test("rejects invalid keys before contacting object storage", async () => {
        const store = new S3BlobStore({
            bucket: "files",
            accessKeyId: "test-access-key",
            secretAccessKey: "test-secret-key",
            endpoint: "https://s3.example.test",
            prefix: "tenant/",
        });
        await expect(store.put("", bytes("content"))).rejects.toThrow('invalid blob key ""');
        await expect(store.get("../secret")).rejects.toThrow("invalid blob key");
        await expect(store.delete("folder/../../secret")).rejects.toThrow("invalid blob key");
    });
});

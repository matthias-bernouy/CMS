import { describe, test, expect } from "bun:test";
import { InMemoryCmsFilesBlob } from "@bernouy/cms-shared";

const bytes = (s: string) => new TextEncoder().encode(s);
const read = async (stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array | null> =>
    stream ? new Uint8Array(await new Response(stream).arrayBuffer()) : null;

describe("InMemoryCmsFilesBlob", () => {
    test("put returns the size and get reads the same bytes back", async () => {
        const store = new InMemoryCmsFilesBlob();
        const { size } = await store.put("id-1", bytes("hello"));
        expect(size).toBe(5);
        expect(await read(await store.get("id-1"))).toEqual(bytes("hello"));
    });

    test("get on a missing key is null; exists reflects presence", async () => {
        const store = new InMemoryCmsFilesBlob();
        expect(await store.get("nope")).toBeNull();
        expect(await store.exists("nope")).toBe(false);
        await store.put("k", bytes("x"));
        expect(await store.exists("k")).toBe(true);
    });

    test("put overwrites; delete is idempotent", async () => {
        const store = new InMemoryCmsFilesBlob();
        await store.put("k", bytes("one"));
        await store.put("k", bytes("twotwo"));
        expect((await read(await store.get("k")))!.byteLength).toBe(6);
        await store.delete("k");
        await store.delete("k"); // no throw
        expect(await store.exists("k")).toBe(false);
    });

    test("accepts a ReadableStream input", async () => {
        const store = new InMemoryCmsFilesBlob();
        const { size } = await store.put("s", new Response(bytes("streamed")).body!);
        expect(size).toBe(8);
        expect(await read(await store.get("s"))).toEqual(bytes("streamed"));
    });
});

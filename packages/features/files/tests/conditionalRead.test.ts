import { expect, test } from "bun:test";
import type { BlobReadOptions } from "@bernouy/blob-store";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService, type FileRecord } from "@bernouy/files";
import { InMemoryCmsFilesStore } from "@bernouy/files/memory";

class CountingBlobs extends MemoryBlobStore {
    gets = 0;
    heads = 0;
    override get(key: string, options?: BlobReadOptions) {
        this.gets++;
        return super.get(key, options);
    }
    override head(key: string) {
        this.heads++;
        return super.head(key);
    }
}

async function fixture() {
    const store = new InMemoryCmsFilesStore();
    const blobs = new CountingBlobs();
    let now = new Date("2026-01-01T00:00:00Z");
    const files = new CmsFilesService({
        store,
        blobs,
        signingKey: new Uint8Array(32).fill(7),
        publicBaseUrl: "https://site.test",
        now: () => now,
    });
    const namespace = await files.createNamespace({
        name: "Files",
        defaultVisibility: "public",
        createdBy: { kind: "system", id: "test" },
    });
    const file: FileRecord = {
        id: "file-one",
        generation: "a".repeat(64),
        namespaceId: namespace.namespaceId,
        blobKey: "original",
        name: "file.webp",
        size: 6,
        mimeType: "image/webp",
        contentHash: "a".repeat(64),
        generationNumber: 1,
        visibility: "public",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        variants: [
            { profile: "thumbnail", width: 100, height: 50, size: 3, mimeType: "image/webp", blobKey: "variant" },
        ],
    };
    await store.putFile(file);
    await blobs.put("original", new TextEncoder().encode("abcdef"));
    await blobs.put("variant", new TextEncoder().encode("abc"));
    const input = { fileId: file.id, generation: file.generation };
    return {
        files,
        file,
        namespace,
        store,
        blobs,
        input,
        advance: () => {
            now = new Date(now.getTime() + 61_000);
        },
    };
}

test("HEAD and matching conditional reads check existence without opening original or representation bytes", async () => {
    const f = await fixture();
    for (const variant of [false, true]) {
        const input = { ...f.input, profile: "thumbnail" as const, width: 100 };
        const read = variant ? f.files.readRepresentation.bind(f.files, input) : f.files.readFile.bind(f.files, input);
        const full = await read();
        expect(await new Response(full.stream).text()).toBe(variant ? "abc" : "abcdef");
        const head = await read({ metadataOnly: true });
        expect(head).toMatchObject({
            status: 200,
            contentLength: full.contentLength,
            etag: full.etag,
            cacheControl: full.cacheControl,
        });
        expect(await new Response(head.stream).text()).toBe("");
        for (const ifNoneMatch of [full.etag, `W/${full.etag}`, `"other", ${full.etag}`, "*"]) {
            const conditional = await read({ ifNoneMatch });
            expect(conditional.status).toBe(304);
            await conditional.stream.cancel();
        }
        const range = await read();
        await range.stream.cancel();
    }
    expect(f.blobs.gets).toBe(4);
    expect(f.blobs.heads).toBe(10);
    await f.blobs.delete("original");
    await expect(f.files.readFile(f.input, { metadataOnly: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(f.files.readFile(f.input, { ifNoneMatch: "*" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("conditional metadata never bypasses private signatures, expiry, deletion or namespace ownership", async () => {
    const f = await fixture();
    await f.store.putFile({ ...f.file, visibility: "private" });
    for (const conditions of [{ metadataOnly: true }, { ifNoneMatch: "*" }]) {
        await expect(f.files.readFile(f.input, conditions)).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
    }
    expect(f.blobs.heads).toBe(0);
    const signed = await f.files.signFile({
        ...f.input,
        namespaceId: f.namespace.namespaceId,
        namespaceKey: f.namespace.namespaceKey,
        expiresInSeconds: 60,
    });
    const access = new URL(signed.url).searchParams.get("access")!;
    expect((await f.files.readFile({ ...f.input, access }, { ifNoneMatch: "*" })).status).toBe(304);
    f.advance();
    await expect(f.files.readFile({ ...f.input, access }, { ifNoneMatch: "*" })).rejects.toMatchObject({
        code: "NOT_AUTHORIZED",
    });
    await expect(
        f.files.signFile({
            ...f.input,
            namespaceId: "foreign",
            namespaceKey: f.namespace.namespaceKey,
            expiresInSeconds: 60,
        }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.blobs.gets).toBe(0);
});

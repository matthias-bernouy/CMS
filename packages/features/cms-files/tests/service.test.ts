import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesError, CmsFilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";

function service(now = new Date("2026-01-01T00:00:00.000Z")) {
    return new CmsFilesService({
        store: new InMemoryCmsFilesStore(),
        blobs: new MemoryBlobStore(),
        signingKey: new Uint8Array(32).fill(7),
        publicBaseUrl: "https://cms.example/site",
        now: () => now,
    });
}

test("namespace credentials authorize a streamed immutable public file", async () => {
    const files = service();
    const namespace = await files.createNamespace({
        name: "Products",
        defaultVisibility: "private",
        createdBy: { kind: "provider", id: "installation-a" },
    });
    const upload = await files.createUpload({
        namespaceKey: namespace.namespaceKey,
        namespaceId: namespace.namespaceId,
        filename: "manual.txt",
        size: 5,
        mimeType: "text/plain",
        visibility: "public",
    });
    await files.writeUpload(upload.uploadId, upload.uploadToken, stream("hello"));
    const reference = await files.completeUpload(namespace.namespaceId, namespace.namespaceKey, upload.uploadId);

    expect(reference.generation).toMatch(/^[0-9a-f]{64}$/);
    expect(reference.url).toContain("/.cms/call/ulvia.cms.files/files/");
    const read = await files.readFile({
        fileId: reference.fileId,
        generation: reference.generation,
        range: "bytes=1-3",
    });
    expect(read.status).toBe(206);
    expect(read.contentRange).toBe("bytes 1-3/5");
    expect(await new Response(read.stream).text()).toBe("ell");
});

test("private files require an opaque signature minted by cms-files", async () => {
    const files = service();
    const namespace = await files.createNamespace({
        name: "Private",
        defaultVisibility: "private",
        createdBy: { kind: "administrator", id: "admin" },
    });
    const upload = await files.createUpload({
        namespaceKey: namespace.namespaceKey,
        namespaceId: namespace.namespaceId,
        filename: "secret.bin",
        size: 3,
        visibility: "private",
    });
    await files.writeUpload(upload.uploadId, upload.uploadToken, stream("abc"));
    const reference = await files.completeUpload(namespace.namespaceId, namespace.namespaceKey, upload.uploadId);

    await expect(files.readFile(reference)).rejects.toBeInstanceOf(CmsFilesError);
    const signed = await files.signFile({
        namespaceKey: namespace.namespaceKey,
        namespaceId: namespace.namespaceId,
        fileId: reference.fileId,
        generation: reference.generation,
        expiresInSeconds: 60,
    });
    const access = new URL(signed.url).searchParams.get("access")!;
    const read = await files.readFile({ ...reference, access });
    expect(await new Response(read.stream).text()).toBe("abc");
});

test("upload tokens are bounded to their session and exact declared size", async () => {
    const files = service();
    const namespace = await files.createNamespace({
        name: "Uploads",
        defaultVisibility: "private",
        createdBy: { kind: "system", id: "test" },
    });
    const upload = await files.createUpload({
        namespaceKey: namespace.namespaceKey,
        namespaceId: namespace.namespaceId,
        filename: "bad.bin",
        size: 2,
        visibility: "private",
    });
    await expect(files.writeUpload(upload.uploadId, upload.uploadToken, stream("three"))).rejects.toMatchObject({
        code: "SIZE_MISMATCH",
    });
    await expect(
        files.completeUpload(namespace.namespaceId, namespace.namespaceKey, upload.uploadId),
    ).rejects.toMatchObject({
        code: "UPLOAD_NOT_READY",
    });
});

test("invalid ranges expose the required unsatisfied Content-Range", async () => {
    const files = service();
    const namespace = await files.createNamespace({
        name: "Ranges",
        defaultVisibility: "public",
        createdBy: { kind: "system", id: "test" },
    });
    const upload = await files.createUpload({
        namespaceKey: namespace.namespaceKey,
        namespaceId: namespace.namespaceId,
        filename: "range.bin",
        size: 3,
        visibility: "public",
    });
    await files.writeUpload(upload.uploadId, upload.uploadToken, stream("abc"));
    const reference = await files.completeUpload(namespace.namespaceId, namespace.namespaceKey, upload.uploadId);
    await expect(files.readFile({ ...reference, range: "bytes=8-9" })).rejects.toMatchObject({
        code: "RANGE_NOT_SATISFIABLE",
        status: 416,
        responseHeaders: { "content-range": "bytes */3" },
    });
});

test("uploads inherit the namespace visibility when none is supplied", async () => {
    const files = service();
    const namespace = await files.createNamespace({
        name: "Public by default",
        defaultVisibility: "public",
        createdBy: { kind: "system", id: "test" },
    });
    const upload = await files.createUpload({
        namespaceKey: namespace.namespaceKey,
        namespaceId: namespace.namespaceId,
        filename: "default.txt",
        size: 2,
    });
    await files.writeUpload(upload.uploadId, upload.uploadToken, stream("ok"));
    const reference = await files.completeUpload(namespace.namespaceId, namespace.namespaceKey, upload.uploadId);
    expect(reference.visibility).toBe("public");
    expect((await files.readFile(reference)).cacheControl).toContain("immutable");
});

function stream(value: string): ReadableStream<Uint8Array> {
    const bytes = new TextEncoder().encode(value);
    return new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}

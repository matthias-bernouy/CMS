import { describe, expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService, type FileRecord } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";
import { AlternativeFilesProvider } from "./conformance/AlternativeFilesProvider";

type Visibility = "private" | "public";
type Reference = { namespaceId: string; fileId: string; generation: string; url: string };
type Read = {
    stream: ReadableStream<Uint8Array>;
    status: number;
    contentLength: number;
    contentRange?: string;
    cacheControl: string;
    contentType: string;
};
type Subject = {
    namespace(): Promise<{ namespaceId: string; keyId: string; namespaceKey: string }>;
    key(namespaceId: string, namespaceKey: string): Promise<{ keyId: string; namespaceKey: string }>;
    revoke(namespaceId: string, namespaceKey: string, keyId: string): Promise<void>;
    upload(input: {
        namespaceId: string;
        namespaceKey: string;
        name: string;
        bytes: Uint8Array;
        visibility: Visibility;
        image?: boolean;
    }): Promise<Reference>;
    read(reference: Reference, options?: { access?: string; range?: string; ifRange?: string }): Promise<Read>;
    sign(reference: Reference, namespaceKey: string, expiresInSeconds: number): Promise<string>;
    representation(reference: Reference, access?: string): Promise<Read>;
    delete(reference: Reference, namespaceKey: string): Promise<void>;
    settle(): Promise<void>;
    restart(): Subject;
    advance(milliseconds: number): void;
};

for (const [name, factory] of [
    ["official provider", officialSubject],
    ["independent provider", alternativeSubject],
] as const) {
    describe(`cms-files conformance: ${name}`, () => {
        test("credentials, immutable streaming, private signatures, ranges, variants, deletion and restart", async () => {
            const files = factory();
            const namespace = await files.namespace();
            const delegated = await files.key(namespace.namespaceId, namespace.namespaceKey);
            await files.revoke(namespace.namespaceId, namespace.namespaceKey, delegated.keyId);
            await expect(
                files.upload({
                    namespaceId: namespace.namespaceId,
                    namespaceKey: delegated.namespaceKey,
                    name: "revoked.bin",
                    bytes: bytes("x"),
                    visibility: "private",
                }),
            ).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });

            const publicFile = await files.upload({
                namespaceId: namespace.namespaceId,
                namespaceKey: namespace.namespaceKey,
                name: "public.bin",
                bytes: bytes("abcdef"),
                visibility: "public",
            });
            expect(publicFile.url).toContain("/.cms/call/ulvia.cms.files/files/");
            await expect(files.read({ ...publicFile, generation: "wrong" })).rejects.toMatchObject({
                code: "NOT_FOUND",
            });
            const range = await files.read(publicFile, { range: "bytes=1-3" });
            expect(range.status).toBe(206);
            expect(range.contentRange).toBe("bytes 1-3/6");
            expect(range.cacheControl).toBe("public, max-age=31536000, immutable");
            expect(await new Response(range.stream).text()).toBe("bcd");

            const head = await files.read(publicFile);
            expect(head.contentLength).toBe(6);
            await head.stream.cancel("HEAD does not consume bytes");
            const restartedRead = await files.restart().read(publicFile);
            expect(await new Response(restartedRead.stream).text()).toBe("abcdef");

            const privateFile = await files.upload({
                namespaceId: namespace.namespaceId,
                namespaceKey: namespace.namespaceKey,
                name: "private.bin",
                bytes: bytes("secret"),
                visibility: "private",
            });
            await expect(files.read(privateFile)).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });
            const access = await files.sign(privateFile, namespace.namespaceKey, 30);
            expect(await new Response((await files.read(privateFile, { access })).stream).text()).toBe("secret");
            files.advance(31_000);
            await expect(files.read(privateFile, { access })).rejects.toMatchObject({ code: "NOT_AUTHORIZED" });

            const image = await files.upload({
                namespaceId: namespace.namespaceId,
                namespaceKey: namespace.namespaceKey,
                name: "image.png",
                bytes: bytes("image-source"),
                visibility: "public",
                image: true,
            });
            await files.settle();
            const variant = await files.representation(image);
            expect(variant.contentType).toBe("image/webp");
            expect(variant.contentLength).toBeGreaterThan(0);
            await variant.stream.cancel();

            await files.delete(publicFile, namespace.namespaceKey);
            await expect(files.read(publicFile)).rejects.toMatchObject({ code: "NOT_FOUND" });
        });
    });
}

function officialSubject(shared?: {
    store: InMemoryCmsFilesStore;
    blobs: MemoryBlobStore;
    clock: { value: number };
    pending: Set<Promise<void>>;
}): Subject {
    const state =
        shared ??
        ({
            store: new InMemoryCmsFilesStore(),
            blobs: new MemoryBlobStore(),
            clock: { value: Date.parse("2026-01-01T00:00:00.000Z") },
            pending: new Set<Promise<void>>(),
        } satisfies NonNullable<typeof shared>);
    const service = new CmsFilesService({
        store: state.store,
        blobs: state.blobs,
        signingKey: new Uint8Array(32).fill(9),
        publicBaseUrl: "https://official.example",
        now: () => new Date(state.clock.value),
        derivatives: {
            enqueue(file) {
                const task = addTestVariant(file, state.store, state.blobs).finally(() => state.pending.delete(task));
                state.pending.add(task);
            },
        },
    });
    return {
        namespace: () =>
            service.createNamespace({
                name: "Conformance",
                defaultVisibility: "private",
                createdBy: { kind: "system", id: "conformance" },
            }),
        key: (namespaceId, namespaceKey) =>
            service.createNamespaceKey({
                namespaceId,
                namespaceKey,
                permissions: ["files.read", "files.write", "files.delete", "files.sign", "files.publish"],
            }),
        revoke: (namespaceId, namespaceKey, keyId) => service.revokeNamespaceKey(namespaceId, namespaceKey, keyId),
        upload: async (input) => {
            const upload = await service.createUpload({
                namespaceId: input.namespaceId,
                namespaceKey: input.namespaceKey,
                filename: input.name,
                size: input.bytes.byteLength,
                visibility: input.visibility,
                ...(input.image ? { imageProfile: "thumbnail" as const } : {}),
            });
            await service.writeUpload(upload.uploadId, upload.uploadToken, chunked(input.bytes));
            return service.completeUpload(input.namespaceId, input.namespaceKey, upload.uploadId);
        },
        read: (reference, options = {}) => service.readFile({ ...reference, ...options }),
        sign: async (reference, namespaceKey, expiresInSeconds) =>
            new URL(
                (
                    await service.signFile({
                        ...reference,
                        namespaceKey,
                        expiresInSeconds,
                    })
                ).url,
            ).searchParams.get("access")!,
        representation: (reference, access) =>
            service.readRepresentation({
                ...reference,
                profile: "thumbnail",
                width: 64,
                ...(access ? { access } : {}),
            }),
        delete: (reference, namespaceKey) => service.deleteFile(reference.namespaceId, namespaceKey, reference.fileId),
        settle: async () => void (await Promise.all([...state.pending])),
        restart: () => officialSubject(state),
        advance: (milliseconds) => {
            state.clock.value += milliseconds;
        },
    };
}

function alternativeSubject(
    existing?: AlternativeFilesProvider,
    clock = { value: Date.parse("2026-01-01T00:00:00Z") },
): Subject {
    const provider = existing ?? new AlternativeFilesProvider(undefined, () => clock.value);
    return {
        namespace: () => provider.createNamespace(),
        key: (namespaceId, namespaceKey) => provider.createNamespaceKey({ namespaceId, namespaceKey }),
        revoke: (namespaceId, namespaceKey, keyId) => provider.revokeNamespaceKey(namespaceId, namespaceKey, keyId),
        upload: async (input) => {
            const upload = await provider.createUpload({
                namespaceId: input.namespaceId,
                namespaceKey: input.namespaceKey,
                filename: input.name,
                size: input.bytes.byteLength,
                visibility: input.visibility,
                ...(input.image ? { imageProfile: "thumbnail" as const } : {}),
            });
            await provider.writeUpload(upload.uploadId, upload.uploadToken, chunked(input.bytes));
            return provider.completeUpload(input.namespaceId, input.namespaceKey, upload.uploadId);
        },
        read: (reference, options = {}) => provider.readFile({ ...reference, ...options }),
        sign: async (reference, namespaceKey, expiresInSeconds) =>
            new URL((await provider.signFile({ ...reference, namespaceKey, expiresInSeconds })).url).searchParams.get(
                "access",
            )!,
        representation: (reference, access) =>
            provider.readRepresentation({
                ...reference,
                profile: "thumbnail",
                width: 64,
                ...(access ? { access } : {}),
            }),
        delete: (reference, namespaceKey) => provider.deleteFile(reference.namespaceId, namespaceKey, reference.fileId),
        settle: async () => undefined,
        restart: () => alternativeSubject(new AlternativeFilesProvider(provider.state, () => clock.value), clock),
        advance: (milliseconds) => {
            clock.value += milliseconds;
        },
    };
}

async function addTestVariant(file: FileRecord, store: InMemoryCmsFilesStore, blobs: MemoryBlobStore): Promise<void> {
    if (!file.imageProfile) {
        return;
    }
    const variant = bytes("fake-webp");
    const blobKey = `variants/${file.generation}/test/64.webp`;
    await blobs.put(blobKey, variant);
    await store.putFile({
        ...file,
        width: 64,
        height: 64,
        variants: [
            { profile: "thumbnail", width: 64, height: 64, mimeType: "image/webp", blobKey, size: variant.byteLength },
        ],
    });
}

function chunked(value: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(value.slice(0, Math.max(1, Math.floor(value.byteLength / 2))));
            controller.enqueue(value.slice(Math.max(1, Math.floor(value.byteLength / 2))));
            controller.close();
        },
    });
}

function bytes(value: string): Uint8Array {
    return new TextEncoder().encode(value);
}

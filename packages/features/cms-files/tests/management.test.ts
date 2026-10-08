import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";

test("namespace administrators manage keys, metadata, visibility and deletion", async () => {
    const files = service();
    const namespace = await files.createNamespace({
        name: "Managed assets",
        defaultVisibility: "private",
        createdBy: { kind: "administrator", id: "admin-a" },
    });
    expect(await files.getNamespace(namespace.namespaceId, namespace.namespaceKey)).toMatchObject({
        id: namespace.namespaceId,
        name: "Managed assets",
    });

    const secondary = await files.createNamespaceKey({
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        permissions: ["files.read"],
        expiresAt: "2026-01-02T00:00:00.000Z",
    });
    const replacement = await files.rotateNamespaceKey(namespace.namespaceId, namespace.namespaceKey, secondary.keyId);
    await files.revokeNamespaceKey(namespace.namespaceId, namespace.namespaceKey, replacement.keyId);

    const reference = await upload(files, namespace, "asset.txt", "hello");
    expect(
        await files.listFiles({
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
        }),
    ).toMatchObject({ items: [{ fileId: reference.fileId }] });
    expect(
        await files.getFile({
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            fileId: reference.fileId,
            generation: reference.generation,
        }),
    ).toMatchObject({ name: "asset.txt" });
    expect(
        await files.updateFile({
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            fileId: reference.fileId,
            name: "renamed.txt",
        }),
    ).toMatchObject({ name: "renamed.txt" });
    expect(
        await files.setFileVisibility({
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            fileId: reference.fileId,
            visibility: "public",
        }),
    ).toMatchObject({ visibility: "public" });
    expect(await files.listRepresentations(reference)).toMatchObject({ representations: [] });
    expect(
        await files.signRepresentations({
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            ...reference,
            expiresInSeconds: 60,
        }),
    ).toMatchObject({ representations: [] });

    await files.deleteFile(namespace.namespaceId, namespace.namespaceKey, reference.fileId);
    expect(
        (
            await files.listFiles({
                namespaceId: namespace.namespaceId,
                namespaceKey: namespace.namespaceKey,
            })
        ).items,
    ).toEqual([]);
    await files.deleteNamespace(namespace.namespaceId, namespace.namespaceKey);
});

test("expired uploads are cleaned and public limits reject invalid input", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const files = service(() => now);
    const namespace = await files.createNamespace({
        name: "Temporary assets",
        defaultVisibility: "private",
        createdBy: { kind: "system", id: "cleanup" },
    });
    await files.createUpload({
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        filename: "temporary.bin",
        size: 1,
    });
    now = new Date("2026-01-01T02:00:00.000Z");
    expect(await files.cleanupExpiredUploads()).toBe(1);
    expect(await files.cleanupExpiredUploads()).toBe(0);
    await expect(files.cleanupExpiredUploads(0)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
        files.listFiles({
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            limit: 101,
        }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
        files.createUpload({
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            filename: "invalid.bin",
            size: 1,
            mimeType: "invalid",
        }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

function service(now: () => Date = () => new Date("2026-01-01T00:00:00.000Z")): CmsFilesService {
    return new CmsFilesService({
        store: new InMemoryCmsFilesStore(),
        blobs: new MemoryBlobStore(),
        signingKey: new Uint8Array(32).fill(7),
        publicBaseUrl: "https://cms.example/site",
        now,
    });
}

async function upload(
    files: CmsFilesService,
    namespace: { namespaceId: string; namespaceKey: string },
    filename: string,
    contents: string,
) {
    const pending = await files.createUpload({
        ...namespace,
        filename,
        size: contents.length,
    });
    await files.writeUpload(pending.uploadId, pending.uploadToken, new Blob([contents]).stream());
    return files.completeUpload(namespace.namespaceId, namespace.namespaceKey, pending.uploadId);
}

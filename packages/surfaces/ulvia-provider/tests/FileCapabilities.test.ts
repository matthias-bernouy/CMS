import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";
import { DefaultProviderCapabilityDispatcher, type ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import { registerFileCapabilities } from "@bernouy/ulvia-provider/capabilities";

const context: ProviderCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.0.0",
    siteId: "site-a",
    providerId: "ulvia.official",
};

test("file capabilities expose the namespace, upload and immutable file lifecycle", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerFileCapabilities(dispatcher, files());

    const namespace = await invoke<{ namespaceId: string; keyId: string; namespaceKey: string }>(
        dispatcher,
        "namespace.create",
        { name: "Assets", defaultVisibility: "public" },
    );
    const details = await invoke<{ createdBy: { kind: string; id: string } }>(dispatcher, "namespace.get", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
    });
    expect(details.createdBy).toEqual({ kind: "system", id: "cms-gateway" });

    const secondary = await invoke<{ keyId: string; namespaceKey: string }>(dispatcher, "namespace.keys.create", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        permissions: ["files.read"],
    });
    const replacement = await invoke<{ keyId: string }>(dispatcher, "namespace.keys.rotate", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        keyId: secondary.keyId,
    });
    await invoke(dispatcher, "namespace.keys.revoke", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        keyId: replacement.keyId,
    });

    const upload = await invoke<{ uploadId: string; uploadToken: string }>(dispatcher, "upload.create", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        filename: "résumé.txt",
        size: 5,
        contentType: "text/plain",
        imageProfile: "responsive",
    });
    await invoke(
        dispatcher,
        "upload.write",
        { uploadId: upload.uploadId, uploadToken: upload.uploadToken },
        { ...context, binaryBody: { stream: stream("hello"), contentType: "text/plain", contentLength: 5 } },
    );
    const file = await invoke<{ fileId: string; generation: string }>(dispatcher, "upload.complete", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        uploadId: upload.uploadId,
    });

    expect(
        await invoke(dispatcher, "files.list", {
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            offset: 0,
            limit: 10,
        }),
    ).toMatchObject({ items: [{ fileId: file.fileId }] });
    await invoke(dispatcher, "files.get", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        fileId: file.fileId,
    });
    await invoke(dispatcher, "files.update", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        fileId: file.fileId,
        name: "renamed.txt",
    });
    await invoke(dispatcher, "files.publish", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        fileId: file.fileId,
    });

    const binary = await invoke<{
        kind: string;
        status: number;
        stream: ReadableStream<Uint8Array>;
        headers: Record<string, string>;
    }>(dispatcher, "files.read", { ...file, range: "bytes=1-3" });
    expect(binary.kind).toBe("binary");
    expect(binary.status).toBe(206);
    expect(binary.headers["content-disposition"]).toContain("renamed.txt");
    expect(await new Response(binary.stream).text()).toBe("ell");

    await invoke(dispatcher, "files.make-private", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        fileId: file.fileId,
    });
    const signed = await invoke<{ url: string }>(dispatcher, "files.sign", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        ...file,
        expiresIn: 60,
    });
    const access = new URL(signed.url).searchParams.get("access")!;
    expect(await invoke(dispatcher, "representations.list", { ...file, access })).toMatchObject({
        representations: [],
    });
    expect(
        await invoke(dispatcher, "representations.sign", {
            namespaceId: namespace.namespaceId,
            namespaceKey: namespace.namespaceKey,
            ...file,
            expiresIn: 60,
        }),
    ).toMatchObject({ representations: [] });

    await invoke(dispatcher, "files.delete", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
        fileId: file.fileId,
    });
    await invoke(dispatcher, "namespace.delete", {
        namespaceId: namespace.namespaceId,
        namespaceKey: namespace.namespaceKey,
    });
});

test("managed workspace capabilities never require or return namespace credentials", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const workspaceCalls: string[] = [];
    registerFileCapabilities(dispatcher, files(), {
        get: async () => {
            workspaceCalls.push("get");
            return {
                namespace: {
                    id: "ns_workspace",
                    name: "Site files",
                    defaultVisibility: "private",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    createdBy: { kind: "system", id: "workspace" },
                    quota: { maxBytes: 100, maxFiles: 10 },
                },
                items: [],
                offset: 0,
                limit: 10,
            };
        },
        createUpload: async () => ({ uploadId: "upload", uploadToken: "token", expiresAt: "later", maxBytes: 100 }),
        completeUpload: async () => fileReference(),
        updateFile: async () => fileReference(),
        setFileVisibility: async () => fileReference(),
        signFile: async () => ({ url: "https://cms.example/signed", expiresAt: "later" }),
        deleteFile: async () => undefined,
    });

    const result = await invoke(dispatcher, "workspace.get", { limit: 10 });

    expect(workspaceCalls).toEqual(["get"]);
    expect(JSON.stringify(result)).not.toContain("namespaceKey");
    await invoke(dispatcher, "workspace.files.set-visibility", { fileId: "file_a", visibility: "public" });
    await expect(
        invoke(dispatcher, "workspace.files.set-visibility", { fileId: "file_a", visibility: "shared" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 422 });
});

function files(): CmsFilesService {
    return new CmsFilesService({
        store: new InMemoryCmsFilesStore(),
        blobs: new MemoryBlobStore(),
        signingKey: new Uint8Array(32).fill(7),
        publicBaseUrl: "https://cms.example/site",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
}

async function invoke<T = unknown>(
    dispatcher: DefaultProviderCapabilityDispatcher,
    capabilityId: string,
    input: Record<string, unknown>,
    invocationContext: ProviderCapabilityInvocationContext = context,
): Promise<T> {
    return dispatcher.invoke("ulvia.cms.files", capabilityId, input, invocationContext) as Promise<T>;
}

function stream(value: string): ReadableStream<Uint8Array> {
    return new Blob([value]).stream();
}

function fileReference() {
    return {
        fileId: "file_a",
        generation: "generation_a",
        namespaceId: "ns_workspace",
        mimeType: "text/plain",
        size: 5,
        visibility: "private" as const,
        name: "asset.txt",
        url: "https://cms.example/site/files/file_a/generation_a",
    };
}

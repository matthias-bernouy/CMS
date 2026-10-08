import { expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CmsFilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";
import { DefaultCoreCapabilityDispatcher, type CoreCapabilityInvocationContext } from "@bernouy/cms-core";
import { registerFileCapabilities } from "@bernouy/cms-core/capabilities";

const context: CoreCapabilityInvocationContext = {
    requestId: "00000000-0000-4000-8000-000000000001",
    siteId: "site-a",
    installationId: "install-a",
    origin: "provider",
    actorKind: "provider",
    providerInstallationId: "provider-a",
};

test("file capabilities expose the namespace, upload and immutable file lifecycle", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
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
    expect(details.createdBy).toEqual({ kind: "provider", id: "provider-a" });

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
    dispatcher: DefaultCoreCapabilityDispatcher,
    capabilityId: string,
    input: Record<string, unknown>,
    invocationContext: CoreCapabilityInvocationContext = context,
): Promise<T> {
    return dispatcher.invoke("ulvia.cms.files", capabilityId, input, invocationContext) as Promise<T>;
}

function stream(value: string): ReadableStream<Uint8Array> {
    return new Blob([value]).stream();
}

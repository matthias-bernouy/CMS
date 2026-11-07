import { expect } from "bun:test";
import { CmsFilesService } from "@bernouy/cms-files";
import type { CmsFileWorkspace, FilesService } from "@bernouy/cms-files";
import { InMemoryCmsFilesStore } from "@bernouy/cms-files/memory";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import type { filesFeature } from "@bernouy/cms-files/feature";
import type { CapabilityInput, CapabilityOutput, EffectiveCapabilities } from "@bernouy/ulvia-sdk";
import { filesTransport } from "./transport";
import type { RequestOptions } from "./transport";

type Capabilities = EffectiveCapabilities<typeof filesFeature>;
const writes = new Set([
    "createNamespace",
    "deleteNamespace",
    "putKey",
    "putUpload",
    "deleteUpload",
    "putFile",
    "deleteFile",
]);

export async function filesFixture(
    options: {
        readonly service?: (service: FilesService) => FilesService;
        readonly workspace?: (service: FilesService) => CmsFileWorkspace;
        readonly maxFileBytes?: number;
    } = {},
) {
    const backing = new InMemoryCmsFilesStore();
    const counts = { mutations: 0, listCalls: 0, loaded: 0, keyReads: 0, blobReads: 0, blobWrites: 0 };
    const store = new Proxy(backing, {
        get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver);
            if (typeof value !== "function") {
                return value;
            }
            return (...args: unknown[]) => {
                if (writes.has(String(key))) {
                    counts.mutations++;
                }
                if (key === "getKey") {
                    counts.keyReads++;
                }
                return value.apply(target, args);
            };
        },
    });
    const list = store.listLatestFiles.bind(store);
    store.listLatestFiles = async (namespace, offset, limit) => {
        counts.listCalls++;
        const items = await list(namespace, offset, limit);
        counts.loaded += items.length;
        return items;
    };
    const blobs = new MemoryBlobStore();
    const get = blobs.get.bind(blobs);
    const put = blobs.put.bind(blobs);
    blobs.get = async (...args) => {
        counts.blobReads++;
        return get(...args);
    };
    blobs.put = async (...args) => {
        counts.blobWrites++;
        return put(...args);
    };
    const files = new CmsFilesService({
        store,
        blobs,
        signingKey: new Uint8Array(32).fill(7),
        publicBaseUrl: "https://cms.example/site",
        maxFileBytes: options.maxFileBytes,
        now: () => new Date("2026-11-07T12:00:00Z"),
    });
    const selected = options.service?.(files) ?? files;
    const workspace = options.workspace?.(selected) ?? managedWorkspace(selected);
    const transport = await filesTransport(selected, workspace);
    async function invoke<Id extends keyof Capabilities>(
        id: Id,
        input: CapabilityInput<Capabilities[Id]>,
        request?: RequestOptions,
    ): Promise<CapabilityOutput<Capabilities[Id]>> {
        const response = await transport.call(id, input, request);
        expect(response.status, id).toBeGreaterThanOrEqual(200);
        expect(response.status, id).toBeLessThan(300);
        return (response.status === 204 ? null : await response.json()) as CapabilityOutput<Capabilities[Id]>;
    }
    async function upload(
        credentials: { namespaceId: string; namespaceKey: string },
        text = "hello",
        filename = "résumé.txt",
    ) {
        const session = await invoke("upload.create", {
            namespaceId: credentials.namespaceId,
            namespaceKey: credentials.namespaceKey,
            filename,
            size: new TextEncoder().encode(text).length,
            contentType: "text/plain",
            imageProfile: null,
            fileId: null,
        });
        await invoke(
            "upload.write",
            { uploadId: session.uploadId, uploadToken: session.uploadToken, bytes: new Uint8Array() },
            { bytes: text },
        );
        return invoke("upload.complete", { ...credentials, uploadId: session.uploadId });
    }
    return { ...transport, invoke, upload, files, workspace, store, blobs, counts };
}

/** Test port keeps credentials private, just as the runtime-managed workspace does. */
function managedWorkspace(files: FilesService): CmsFileWorkspace {
    let credentials: ReturnType<FilesService["createNamespace"]> | undefined;
    const load = () =>
        (credentials ??= files.createNamespace({
            name: "Site files",
            defaultVisibility: "private",
            createdBy: { kind: "system", id: "workspace" },
        }));
    return {
        get: async (input) => {
            const keys = await load();
            return {
                namespace: await files.getNamespace(keys.namespaceId, keys.namespaceKey),
                ...(await files.listFiles({ ...keys, ...input })),
            };
        },
        createUpload: async (input) => files.createUpload({ ...(await load()), ...input, mimeType: input.contentType }),
        completeUpload: async (id) => {
            const keys = await load();
            return files.completeUpload(keys.namespaceId, keys.namespaceKey, id);
        },
        updateFile: async (fileId, name) => files.updateFile({ ...(await load()), fileId, name }),
        setFileVisibility: async (fileId, visibility) =>
            files.setFileVisibility({ ...(await load()), fileId, visibility }),
        signFile: async (fileId, generation, expiresInSeconds) =>
            files.signFile({ ...(await load()), fileId, generation, expiresInSeconds }),
        deleteFile: async (id) => {
            const keys = await load();
            await files.deleteFile(keys.namespaceId, keys.namespaceKey, id);
        },
    };
}

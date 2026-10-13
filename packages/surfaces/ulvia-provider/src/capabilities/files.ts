import { CmsFilesError, type CmsFilesService } from "@bernouy/cms-files";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../dispatch/registry";
import type { CmsFileWorkspace } from "../ports";

export function registerFileCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    files: CmsFilesService,
    workspace?: CmsFileWorkspace,
): void {
    dispatcher.register("ulvia.cms.files", "namespace.create", async (input, context) =>
        fileCall(() =>
            files.createNamespace({
                name: requiredText(input.name),
                defaultVisibility: input.defaultVisibility === "public" ? "public" : "private",
                createdBy: {
                    kind: context.subjectId ? "administrator" : "system",
                    id: context.subjectId ?? "cms-gateway",
                },
            }),
        ),
    );
    dispatcher.register("ulvia.cms.files", "namespace.get", async (input) =>
        fileCall(() => files.getNamespace(requiredText(input.namespaceId), requiredText(input.namespaceKey))),
    );
    dispatcher.register("ulvia.cms.files", "namespace.keys.create", async (input) =>
        fileCall(() =>
            files.createNamespaceKey({
                namespaceId: requiredText(input.namespaceId),
                namespaceKey: requiredText(input.namespaceKey),
                permissions: requiredTextArray(input.permissions) as never,
                ...(typeof input.expiresAt === "string" ? { expiresAt: input.expiresAt } : {}),
            }),
        ),
    );
    dispatcher.register("ulvia.cms.files", "namespace.keys.rotate", async (input) =>
        fileCall(() =>
            files.rotateNamespaceKey(
                requiredText(input.namespaceId),
                requiredText(input.namespaceKey),
                requiredText(input.keyId),
            ),
        ),
    );
    dispatcher.register("ulvia.cms.files", "namespace.keys.revoke", async (input) =>
        fileCall(async () => {
            await files.revokeNamespaceKey(
                requiredText(input.namespaceId),
                requiredText(input.namespaceKey),
                requiredText(input.keyId),
            );
            return null;
        }),
    );
    dispatcher.register("ulvia.cms.files", "namespace.delete", async (input) =>
        fileCall(async () => {
            await files.deleteNamespace(requiredText(input.namespaceId), requiredText(input.namespaceKey));
            return null;
        }),
    );
    dispatcher.register("ulvia.cms.files", "upload.create", async (input) =>
        fileCall(() =>
            files.createUpload({
                namespaceId: requiredText(input.namespaceId),
                namespaceKey: requiredText(input.namespaceKey),
                filename: requiredText(input.filename),
                size: requiredInteger(input.size),
                ...(input.contentType ? { mimeType: requiredText(input.contentType) } : {}),
                ...(input.visibility === "public" || input.visibility === "private"
                    ? { visibility: input.visibility }
                    : {}),
                ...(input.imageProfile === "thumbnail" || input.imageProfile === "responsive"
                    ? { imageProfile: input.imageProfile }
                    : {}),
                ...(typeof input.fileId === "string" ? { fileId: requiredText(input.fileId) } : {}),
            }),
        ),
    );
    dispatcher.register("ulvia.cms.files", "upload.write", async (input, context) =>
        fileCall(async () => {
            if (!context.binaryBody) {
                throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
            }
            await files.writeUpload(
                requiredText(input.uploadId),
                requiredText(input.uploadToken),
                context.binaryBody.stream,
            );
            return null;
        }),
    );
    dispatcher.register("ulvia.cms.files", "upload.complete", async (input) =>
        fileCall(() =>
            files.completeUpload(
                requiredText(input.namespaceId),
                requiredText(input.namespaceKey),
                requiredText(input.uploadId),
            ),
        ),
    );
    dispatcher.register("ulvia.cms.files", "files.sign", async (input) =>
        fileCall(() =>
            files.signFile({
                namespaceId: requiredText(input.namespaceId),
                namespaceKey: requiredText(input.namespaceKey),
                fileId: requiredText(input.fileId),
                generation: requiredText(input.generation),
                expiresInSeconds: requiredInteger(input.expiresIn),
            }),
        ),
    );
    dispatcher.register("ulvia.cms.files", "files.list", async (input) =>
        fileCall(() =>
            files.listFiles({
                namespaceId: requiredText(input.namespaceId),
                namespaceKey: requiredText(input.namespaceKey),
                ...(typeof input.offset === "number" ? { offset: requiredInteger(input.offset) } : {}),
                ...(typeof input.limit === "number" ? { limit: requiredInteger(input.limit) } : {}),
            }),
        ),
    );
    dispatcher.register("ulvia.cms.files", "files.get", async (input) =>
        fileCall(() =>
            files.getFile({
                namespaceId: requiredText(input.namespaceId),
                namespaceKey: requiredText(input.namespaceKey),
                fileId: requiredText(input.fileId),
            }),
        ),
    );
    dispatcher.register("ulvia.cms.files", "files.update", async (input) =>
        fileCall(() =>
            files.updateFile({
                namespaceId: requiredText(input.namespaceId),
                namespaceKey: requiredText(input.namespaceKey),
                fileId: requiredText(input.fileId),
                name: requiredText(input.name),
            }),
        ),
    );
    for (const [capabilityId, visibility] of [
        ["files.publish", "public"],
        ["files.make-private", "private"],
    ] as const) {
        dispatcher.register("ulvia.cms.files", capabilityId, async (input) =>
            fileCall(() =>
                files.setFileVisibility({
                    namespaceId: requiredText(input.namespaceId),
                    namespaceKey: requiredText(input.namespaceKey),
                    fileId: requiredText(input.fileId),
                    visibility,
                }),
            ),
        );
    }
    dispatcher.register("ulvia.cms.files", "files.delete", async (input) =>
        fileCall(async () => {
            await files.deleteFile(
                requiredText(input.namespaceId),
                requiredText(input.namespaceKey),
                requiredText(input.fileId),
            );
            return null;
        }),
    );
    dispatcher.register("ulvia.cms.files", "files.read", async (input) =>
        fileCall(async () => {
            const read = await files.readFile({
                fileId: requiredText(input.fileId),
                generation: requiredText(input.generation),
                ...(typeof input.access === "string" ? { access: input.access } : {}),
                ...(typeof input.range === "string" ? { range: input.range } : {}),
                ...(typeof input.ifRange === "string" ? { ifRange: input.ifRange } : {}),
            });
            return binaryResult(read);
        }),
    );
    dispatcher.register("ulvia.cms.files", "representations.list", async (input) =>
        fileCall(() =>
            files.listRepresentations({
                fileId: requiredText(input.fileId),
                generation: requiredText(input.generation),
                ...(typeof input.access === "string" ? { access: input.access } : {}),
                ...(typeof input.namespaceKey === "string" ? { namespaceKey: input.namespaceKey } : {}),
            }),
        ),
    );
    dispatcher.register("ulvia.cms.files", "representations.read", async (input) =>
        fileCall(async () =>
            binaryResult(
                await files.readRepresentation({
                    fileId: requiredText(input.fileId),
                    generation: requiredText(input.generation),
                    profile: input.profile === "thumbnail" ? "thumbnail" : "responsive",
                    width: requiredInteger(input.width),
                    ...(typeof input.access === "string" ? { access: input.access } : {}),
                    ...(typeof input.range === "string" ? { range: input.range } : {}),
                    ...(typeof input.ifRange === "string" ? { ifRange: input.ifRange } : {}),
                }),
            ),
        ),
    );
    dispatcher.register("ulvia.cms.files", "representations.sign", async (input) =>
        fileCall(() =>
            files.signRepresentations({
                namespaceId: requiredText(input.namespaceId),
                namespaceKey: requiredText(input.namespaceKey),
                fileId: requiredText(input.fileId),
                generation: requiredText(input.generation),
                expiresInSeconds: requiredInteger(input.expiresIn),
            }),
        ),
    );
    if (workspace) {
        registerWorkspaceCapabilities(dispatcher, workspace);
    }
}

function registerWorkspaceCapabilities(dispatcher: ProviderCapabilityRegistry, workspace: CmsFileWorkspace): void {
    dispatcher.register("ulvia.cms.files", "workspace.get", async (input) =>
        fileCall(() =>
            workspace.get({
                ...(typeof input.offset === "number" ? { offset: requiredInteger(input.offset) } : {}),
                ...(typeof input.limit === "number" ? { limit: requiredInteger(input.limit) } : {}),
            }),
        ),
    );
    dispatcher.register("ulvia.cms.files", "workspace.upload.create", async (input) =>
        fileCall(() =>
            workspace.createUpload({
                filename: requiredText(input.filename),
                size: requiredInteger(input.size),
                ...(typeof input.contentType === "string" ? { contentType: requiredText(input.contentType) } : {}),
                ...(input.visibility === "public" || input.visibility === "private"
                    ? { visibility: input.visibility }
                    : {}),
                ...(input.imageProfile === "thumbnail" || input.imageProfile === "responsive"
                    ? { imageProfile: input.imageProfile }
                    : {}),
                ...(typeof input.fileId === "string" ? { fileId: requiredText(input.fileId) } : {}),
            }),
        ),
    );
    dispatcher.register("ulvia.cms.files", "workspace.upload.complete", async (input) =>
        fileCall(async () => {
            await workspace.completeUpload(requiredText(input.uploadId));
            return null;
        }),
    );
    dispatcher.register("ulvia.cms.files", "workspace.files.update", async (input) =>
        fileCall(async () => {
            await workspace.updateFile(requiredText(input.fileId), requiredText(input.name));
            return null;
        }),
    );
    dispatcher.register("ulvia.cms.files", "workspace.files.set-visibility", async (input) =>
        fileCall(async () => {
            await workspace.setFileVisibility(requiredText(input.fileId), requiredVisibility(input.visibility));
            return null;
        }),
    );
    dispatcher.register("ulvia.cms.files", "workspace.files.sign", async (input) =>
        fileCall(() =>
            workspace.signFile(
                requiredText(input.fileId),
                requiredText(input.generation),
                requiredInteger(input.expiresIn),
            ),
        ),
    );
    dispatcher.register("ulvia.cms.files", "workspace.files.delete", async (input) =>
        fileCall(async () => {
            await workspace.deleteFile(requiredText(input.fileId));
            return null;
        }),
    );
}

function binaryResult(read: Awaited<ReturnType<CmsFilesService["readFile"]>>) {
    return {
        kind: "binary" as const,
        stream: read.stream,
        contentType: read.contentType,
        status: read.status,
        contentLength: read.contentLength,
        headers: {
            etag: read.etag,
            "cache-control": read.cacheControl,
            "accept-ranges": "bytes",
            ...(read.contentRange ? { "content-range": read.contentRange } : {}),
            "content-disposition": contentDisposition(read.file.name),
        },
    };
}

async function fileCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof ProviderCapabilityDispatchError) {
            throw error;
        }
        if (error instanceof CmsFilesError) {
            throw new ProviderCapabilityDispatchError(error.code, error.status, error.code, error.responseHeaders);
        }
        throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
    }
}

function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function requiredInteger(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return Number(value);
}

function requiredTextArray(value: unknown): readonly string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function requiredVisibility(value: unknown): "private" | "public" {
    if (value !== "private" && value !== "public") {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function contentDisposition(name: string): string {
    const safe = name.replace(/[\r\n"\\]/gu, "_");
    return 'inline; filename="' + safe + "\"; filename*=UTF-8''" + encodeURIComponent(name);
}

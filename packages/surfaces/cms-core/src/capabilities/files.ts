import { createFileFolder, deleteFileTree, type FilesItem, updateFileItem } from "@bernouy/cms-content/files";
import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "../dispatch/registry";
import type { CmsFileDependencies } from "../ports";

export function registerFileCapabilities(dispatcher: CoreCapabilityRegistry, core: CmsFileDependencies): void {
    dispatcher.register("ulvia.cms.files", "list", async (input) => {
        const page = integer(input.page, 1);
        const limit = integer(input.limit, 50);
        const listing = await core.filesMetadata.listChildren(optionalText(input.parentId) ?? null, {
            ...(optionalText(input.search) ? { search: optionalText(input.search) } : {}),
            pagination: { page, limit },
        });
        return { ...listing, items: listing.items.map(projectItem) };
    });
    dispatcher.register("ulvia.cms.files", "get", async (input) => {
        const item = await core.filesMetadata.getItem(requiredText(input.fileId));
        if (!item) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectItem(item);
    });
    dispatcher.register("ulvia.cms.files", "create-folder", async (input) =>
        fileCommand(async () =>
            projectItem(
                await createFileFolder(core.filesMetadata, core.fileMutations, {
                    name: requiredText(input.name),
                    parentId: input.parentId === null ? null : (optionalText(input.parentId) ?? null),
                }),
            ),
        ),
    );
    dispatcher.register("ulvia.cms.files", "update", async (input) =>
        fileCommand(async () => {
            if (input.name === undefined && input.parentId === undefined) {
                throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
            }
            const item = await updateFileItem(
                core.filesMetadata,
                core.fileMutations,
                requiredText(input.fileId),
                {
                    ...(input.name === undefined ? {} : { name: requiredText(input.name) }),
                    ...(input.parentId === undefined
                        ? {}
                        : { parentId: input.parentId === null ? null : requiredText(input.parentId) }),
                },
                requiredRevision(input.expectedRevision),
            );
            if (!item) {
                throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
            }
            return projectItem(item);
        }),
    );
    dispatcher.register("ulvia.cms.files", "delete", async (input) =>
        fileCommand(async () => {
            const id = requiredText(input.fileId);
            const current = await core.filesMetadata.getItem(id);
            if (!current) {
                throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
            }
            const result = await deleteFileTree(
                core.filesMetadata,
                core.filesBlob,
                id,
                input.recursive === true,
                core.fileMutations,
                requiredRevision(input.expectedRevision),
            );
            return { id, deleted: true, deletedFileCount: result.deletedFileIds.length };
        }),
    );
}

function projectItem(item: FilesItem) {
    return {
        id: item.id,
        revision: item.revision,
        type: item.type,
        name: item.name,
        parentId: item.parentId,
        ...(item.type === "file"
            ? {
                  size: item.size,
                  mimeType: item.mimeType,
              }
            : {}),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
    };
}

async function fileCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CoreCapabilityDispatchError) {
            throw error;
        }
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        if (status === 409) {
            throw new CoreCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        if (String(error).includes("already exists")) {
            throw new CoreCapabilityDispatchError("NAME_CONFLICT", 409);
        }
        if (String(error).includes("not empty")) {
            throw new CoreCapabilityDispatchError("FOLDER_NOT_EMPTY", 409);
        }
        throw new CoreCapabilityDispatchError("INVALID_INPUT", status || 422);
    }
}

function optionalText(value: unknown): string | undefined {
    return typeof value === "string" && value.length ? value : undefined;
}

function requiredText(value: unknown): string {
    const result = optionalText(value);
    if (!result) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return result;
}

function integer(value: unknown, fallback: number): number {
    return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function requiredRevision(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return Number(value);
}

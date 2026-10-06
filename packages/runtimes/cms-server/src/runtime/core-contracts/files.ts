import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import { createFileFolder, type FilesItem } from "@bernouy/cms-content/files";
import type { CoreStores } from "../stores/core";

export function registerFileCapabilities(dispatcher: CoreCapabilityRegistry, core: CoreStores): void {
    dispatcher.register("ulvia.cms.files", "list", async (input) => {
        const page = number(input.page, 1);
        const limit = number(input.limit, 50);
        const listing = await core.filesMetadata.listChildren(text(input.parentId) ?? null, {
            ...(text(input.search) ? { search: text(input.search) } : {}),
            pagination: { page, limit },
        });
        return {
            ...listing,
            items: listing.items.map(projectItem),
        };
    });
    dispatcher.register("ulvia.cms.files", "create-folder", async (input) => {
        try {
            const folder = await createFileFolder(core.filesMetadata, core.fileMutations, {
                name: requiredText(input.name),
                parentId: input.parentId === null ? null : (text(input.parentId) ?? null),
            });
            return {
                ...folder,
                createdAt: folder.createdAt.toISOString(),
                updatedAt: folder.updatedAt.toISOString(),
            };
        } catch (error) {
            const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
            throw new CoreCapabilityDispatchError(status === 409 ? "CONFLICT" : "INVALID_INPUT", status || 422);
        }
    });
}

function projectItem(item: FilesItem) {
    return {
        id: item.id,
        type: item.type,
        name: item.name,
        parentId: item.parentId,
        ...(item.type === "file" ? { size: item.size, mimeType: item.mimeType } : {}),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
    };
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.length ? value : undefined;
}

function requiredText(value: unknown): string {
    const result = text(value);
    if (!result) {
        throw new TypeError("A non-empty string is required");
    }
    return result;
}

function number(value: unknown, fallback: number): number {
    return Number.isSafeInteger(value) ? Number(value) : fallback;
}

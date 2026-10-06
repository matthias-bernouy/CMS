import type { CmsRepository } from "cms-content/application/interfaces/CmsRepository";
import {
    ContentValidationError,
    DuplicatePagePathError,
    PageRevisionConflictError,
} from "cms-content/application/core/validation/errors";
import { createCmsPage } from "cms-content/pages/core/contracts/createPage";
import { listCmsPages } from "cms-content/pages/core/contracts/listPages";
import { deleteCmsPage, publishCmsPage, updateCmsPage } from "cms-content/pages/core/contracts/mutatePage";
import { getCmsPage } from "cms-content/pages/core/contracts/pageDetails";
import { CmsPageNotFoundError, renameCmsPage } from "cms-content/pages/core/contracts/renamePage";

export type CoreCapabilityHandler = (input: Readonly<Record<string, unknown>>) => Promise<unknown>;

export interface CoreCapabilityDispatcher {
    invoke(contractId: string, capabilityId: string, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}

export interface CoreCapabilityRegistry extends CoreCapabilityDispatcher {
    register(contractId: string, capabilityId: string, handler: CoreCapabilityHandler): void;
}

export class CoreCapabilityDispatchError extends Error {
    constructor(
        readonly code: string,
        readonly status: number,
        message = code,
    ) {
        super(message);
        this.name = "CoreCapabilityDispatchError";
    }
}

/** Closed runtime registry: features register handlers, while the HTTP transport stays domain-neutral. */
export class DefaultCoreCapabilityDispatcher implements CoreCapabilityRegistry {
    readonly #handlers = new Map<string, CoreCapabilityHandler>();

    register(contractId: string, capabilityId: string, handler: CoreCapabilityHandler): void {
        const key = capabilityKey(contractId, capabilityId);
        if (this.#handlers.has(key)) {
            throw new Error(`Core capability is already registered: ${contractId}/${capabilityId}`);
        }
        this.#handlers.set(key, handler);
    }

    async invoke(contractId: string, capabilityId: string, input: Readonly<Record<string, unknown>>): Promise<unknown> {
        const handler = this.#handlers.get(capabilityKey(contractId, capabilityId));
        if (!handler) {
            throw new CoreCapabilityDispatchError("CAPABILITY_NOT_FOUND", 404);
        }
        return handler(input);
    }
}

export function registerCmsPageCoreCapabilities(dispatcher: CoreCapabilityRegistry, repository: CmsRepository): void {
    const register = (capabilityId: string, handler: CoreCapabilityHandler, invalidCode = "INVALID_PAGE") => {
        dispatcher.register("ulvia.cms.pages", capabilityId, async (input) =>
            pageCommand(() => handler(input), invalidCode),
        );
    };
    register("list", (input) => listCmsPages(repository, input));
    register("get", (input) => getCmsPage(repository, input as never));
    register("create", (input) => createCmsPage(repository, input as never));
    register("update", (input) => updateCmsPage(repository, input as never));
    register("publish", (input) => publishCmsPage(repository, input as never));
    register("delete", (input) => deleteCmsPage(repository, input as never));
    register("rename", (input) => renameCmsPage(repository, input as never), "INVALID_TITLE");
}

async function pageCommand(operation: () => Promise<unknown>, invalidCode: string): Promise<unknown> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CmsPageNotFoundError) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (error instanceof PageRevisionConflictError) {
            throw new CoreCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        if (error instanceof DuplicatePagePathError) {
            throw new CoreCapabilityDispatchError("PATH_CONFLICT", 409);
        }
        if (error instanceof ContentValidationError || error instanceof TypeError) {
            throw new CoreCapabilityDispatchError(invalidCode, 422);
        }
        throw error;
    }
}

function capabilityKey(contractId: string, capabilityId: string): string {
    if (!contractId || !capabilityId) {
        throw new TypeError("Core capability identity is required.");
    }
    return `${contractId}\0${capabilityId}`;
}

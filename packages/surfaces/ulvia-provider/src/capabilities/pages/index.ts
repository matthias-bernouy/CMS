import {
    ContentValidationError,
    DuplicatePagePathError,
    PageRevisionConflictError,
    CmsPageNotFoundError,
    createCmsPage,
    deleteCmsPage,
    getCmsPage,
    getCmsEditorCatalogue,
    listCmsPages,
    publishCmsPage,
    renameCmsPage,
    updateCmsPage,
    updateCmsPageRoute,
    updateCmsPageSeo,
} from "@bernouy/cms-content";
import {
    ProviderCapabilityDispatchError,
    type ProviderCapabilityHandler,
    type ProviderCapabilityRegistry,
} from "../../dispatch/registry";
import type { CmsPageDependencies } from "../../ports";

export function registerPageCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsPageDependencies,
): void {
    const register = (capabilityId: string, handler: ProviderCapabilityHandler, invalidCode = "INVALID_PAGE") => {
        dispatcher.register("ulvia.cms.pages", capabilityId, async (input, context) =>
            pageCommand(() => handler(input, context), invalidCode),
        );
    };
    register("list", (input) => listCmsPages(dependencies.repo, input));
    register("get", (input) => getCmsPage(dependencies.repo, input as never));
    register("editor-catalogue", () => getCmsEditorCatalogue(dependencies.repo));
    register("create", (input) => createCmsPage(dependencies.repo, input as never));
    register("update", (input) => updateCmsPage(dependencies.repo, input as never));
    register("update-route", (input) => updateCmsPageRoute(dependencies.repo, input as never));
    register("update-seo", (input) => updateCmsPageSeo(dependencies.repo, input as never));
    register("publish", (input) => publishCmsPage(dependencies.repo, input as never));
    register("delete", (input) => deleteCmsPage(dependencies.repo, input as never));
    register("rename", (input) => renameCmsPage(dependencies.repo, input as never), "INVALID_TITLE");
}

async function pageCommand(operation: () => Promise<unknown>, invalidCode: string): Promise<unknown> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CmsPageNotFoundError) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (error instanceof PageRevisionConflictError) {
            throw new ProviderCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        if (error instanceof DuplicatePagePathError) {
            throw new ProviderCapabilityDispatchError("PATH_CONFLICT", 409);
        }
        if (error instanceof ContentValidationError || error instanceof TypeError) {
            throw new ProviderCapabilityDispatchError(invalidCode, 422);
        }
        throw error;
    }
}

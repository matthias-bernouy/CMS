import { officialFailure } from "../../../dispatch/errors/failure";
import { listExamples, getExample } from "./examples";
import {
    ContentValidationError,
    DuplicatePagePathError,
    PageRevisionConflictError,
    PageReferencedError,
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
import { type ProviderCapabilityHandler, type ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports";

export function registerPageCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
): void {
    const register = (capabilityId: string, handler: ProviderCapabilityHandler, invalidCode = "INVALID_PAGE") => {
        dispatcher.register("ulvia.cms.content", `pages.${capabilityId}`, async (input, context) =>
            pageCommand(() => handler(input, context), invalidCode),
        );
    };
    dispatcher.register("ulvia.cms.content", "examples.list", (input) =>
        pageCommand(() => listExamples(dependencies, input as never), "INVALID_INPUT"),
    );
    dispatcher.register("ulvia.cms.content", "examples.get", (input) =>
        pageCommand(() => getExample(dependencies, input as never), "INVALID_INPUT"),
    );
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
            throw officialFailure("NOT_FOUND", 404, error);
        }
        if (error instanceof PageReferencedError) {
            throw officialFailure("PAGE_REFERENCED", 409, error);
        }
        if (error instanceof PageRevisionConflictError) {
            throw officialFailure("REVISION_CONFLICT", 409, error);
        }
        if (error instanceof DuplicatePagePathError) {
            throw officialFailure("PATH_CONFLICT", 409, error);
        }
        if (typeof error === "object" && error && "status" in error && error.status === 423) {
            throw officialFailure("CORE_UNAVAILABLE", 503, error);
        }
        if (error instanceof ContentValidationError) {
            throw officialFailure(invalidCode, 422, error);
        }
        throw error;
    }
}

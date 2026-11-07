import { officialFailure } from "../../../dispatch/errors/failure";
import {
    BlocRevisionConflictError,
    ContentConflictError,
    ContentValidationError,
    SiteBlocNotFoundError,
    createCmsSiteBloc,
    getCmsSiteBloc,
    listCmsSiteBlocs,
    publishCmsSiteBloc,
    setCmsSiteBlocArchived,
} from "@bernouy/cms-content";
import { type ProviderCapabilityHandler, type ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { CmsContentDependencies } from "../../../ports/index";

export function registerSiteBlocCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsContentDependencies,
): void {
    const register = (capabilityId: string, handler: ProviderCapabilityHandler) => {
        dispatcher.register("ulvia/cms.content", `site-blocs.${capabilityId}`, async (input, context) =>
            siteBlocCommand(() => handler(input, context)),
        );
    };
    register("list", () => listCmsSiteBlocs(dependencies.repo));
    register("get", (input) => getCmsSiteBloc(dependencies.repo, input as never));
    register("create", (input) => createCmsSiteBloc(dependencies.repo, input as never));
    register("publish", (input) => publishCmsSiteBloc(dependencies.repo, input as never));
    register("archive", (input) => setCmsSiteBlocArchived(dependencies.repo, input as never, true));
    register("restore", (input) => setCmsSiteBlocArchived(dependencies.repo, input as never, false));
}

async function siteBlocCommand(operation: () => Promise<unknown>): Promise<unknown> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof SiteBlocNotFoundError) {
            throw officialFailure("NOT_FOUND", 404, error);
        }
        if (error instanceof BlocRevisionConflictError) {
            throw officialFailure("REVISION_CONFLICT", 409, error);
        }
        if (error instanceof ContentConflictError) {
            throw officialFailure("TAG_CONFLICT", 409, error);
        }
        if (error instanceof ContentValidationError || error instanceof TypeError) {
            throw officialFailure("INVALID_SITE_BLOC", 422, error);
        }
        throw error;
    }
}

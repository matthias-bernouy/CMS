import { DocumentationError } from "@bernouy/cms-documentation";
import type { CmsDocumentation } from "@bernouy/cms-documentation";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { ProviderCapabilityRegistry } from "../../../dispatch/registry";

export function registerDocumentationCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    documentation?: CmsDocumentation,
): void {
    for (const operation of ["search", "get"] as const) {
        dispatcher.register("ulvia.cms.installations", `documentation.${operation}`, async (input) => {
            if (!documentation) {
                throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
            }
            try {
                return await documentation[operation](input);
            } catch (error) {
                if (error instanceof DocumentationError) {
                    throw new ProviderCapabilityDispatchError(
                        error.code,
                        { INVALID_INPUT: 422, NOT_FOUND: 404, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 }[
                            error.code
                        ],
                    );
                }
                throw error;
            }
        });
    }
}

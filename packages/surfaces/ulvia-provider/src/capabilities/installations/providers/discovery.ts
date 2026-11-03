import { RepositoryDiscoveryError } from "@bernouy/cms-repository/repository/search";
import type { RepositoryDiscovery } from "@bernouy/cms-repository/repository/search";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { ProviderCapabilityRegistry } from "../../../dispatch/registry";

export function registerRepositoryDiscoveryCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    discovery?: RepositoryDiscovery,
): void {
    for (const operation of ["search", "get"] as const) {
        dispatcher.register("ulvia.cms.installations", `repository.${operation}`, async (input) => {
            if (!discovery) {
                throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
            }
            try {
                return await discovery[operation](input);
            } catch (error) {
                if (error instanceof RepositoryDiscoveryError) {
                    throw new ProviderCapabilityDispatchError(
                        error.code,
                        {
                            INVALID_INPUT: 422,
                            NOT_FOUND: 404,
                            RELEASE_MISMATCH: 409,
                            REVISION_CONFLICT: 409,
                            CATALOGUE_TOO_LARGE: 422,
                            CORE_UNAVAILABLE: 503,
                        }[error.code],
                    );
                }
                throw error;
            }
        });
    }
}

import { compileProviderRoutes as compileGenericRoutes } from "@bernouy/cms-gateway/provider/server";
import type { ResolvedContract } from "@bernouy/cms-repository/contracts";
/** The official surface deliberately mounts its own contracts; independent providers use the generic SDK. */
export function compileProviderRoutes(releases: readonly ResolvedContract[]) {
    if (
        !releases.length ||
        releases.some(
            ({ release }) =>
                !release.contractId.startsWith("ulvia.cms.") && release.contractId !== "ulvia.provider.connections",
        )
    ) {
        throw new TypeError("Ulvia Provider only accepts CMS and Provider connection contract releases.");
    }
    return compileGenericRoutes(releases);
}

export type { HttpBoundCapability } from "@bernouy/cms-gateway/provider/server";

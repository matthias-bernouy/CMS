import { compileProviderRoutes as compileGenericRoutes } from "@bernouy/cms-gateway/provider/server";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
/** The official surface deliberately mounts its own contracts; independent providers use the generic SDK. */
export function compileProviderRoutes(releases: readonly ResolvedContract[]) {
    if (
        !releases.length ||
        releases.some(
            ({ release }) =>
                !release.contractId.startsWith("ulvia/cms.") &&
                release.contractId !== "ulvia/provider.connections" &&
                release.contractId !== "ulvia/repository",
        )
    ) {
        throw new TypeError("Ulvia Provider only accepts official CMS, Repository and Provider connection contracts.");
    }
    return compileGenericRoutes(releases);
}

export type { HttpBoundCapability } from "@bernouy/cms-gateway/provider/server";

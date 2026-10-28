import type { ContractRelease } from "cms-repository/exports/contracts/index";
import type { ProviderContractImplementation } from "../../interfaces/ProviderManifest";
import { ProviderManifestValidationError } from "../protocol/errors";

export function validateDelegationSources(
    implementation: ProviderContractImplementation,
    lineage: readonly ContractRelease[],
    path: string,
): void {
    for (const source of implementation.delegation?.sources ?? []) {
        if (source !== "*" && !lineage.some((release) => release.capabilities.some(({ id }) => id === source))) {
            throw new ProviderManifestValidationError(
                "resolution_failed",
                `unknown delegation source ${source}`,
                `${path}.delegation.sources`,
            );
        }
    }
}

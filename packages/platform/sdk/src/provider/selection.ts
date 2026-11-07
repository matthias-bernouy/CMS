import type { CompiledImplementations } from "ulvia-sdk/interfaces/providers";
import type { ImplementationRelease } from "ulvia-sdk/interfaces/runtime";
import { providerPlan } from "ulvia-sdk/compiler/plan";
import { SdkDefinitionError } from "ulvia-sdk/schema/errors";

/** Resolve host approvals before constructing any handlers or mutating the registry. */
export function selectImplementations<Dependencies>(
    build: CompiledImplementations<Dependencies>,
    releases?: readonly ImplementationRelease[],
) {
    const plan = providerPlan(build);
    if (releases === undefined) {
        return { plan, contracts: build.implementedContracts };
    }
    if (releases.length > build.implementations.length) {
        throw new SdkDefinitionError("Implementation selection exceeds the compiled implementation count");
    }
    const keys = new Set<string>();
    for (const release of releases) {
        const key = `${release.contractId}\0${release.version}`;
        if (
            keys.has(key) ||
            !build.implementations.some(
                (claim) =>
                    claim.contractId === release.contractId &&
                    claim.version === release.version &&
                    claim.digest === release.digest,
            )
        ) {
            throw new SdkDefinitionError(
                `Unsupported or duplicate implementation: ${release.contractId}@${release.version}`,
            );
        }
        keys.add(key);
    }
    return {
        plan: plan.filter((entry) => keys.has(`${entry.contractId}\0${entry.version}`)),
        contracts: build.implementedContracts.filter(({ release }) =>
            keys.has(`${release.contractId}\0${release.version}`),
        ),
    };
}

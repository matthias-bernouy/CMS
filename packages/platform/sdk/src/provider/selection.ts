import type { CompiledImplementations } from "ulvia-sdk/interfaces/providers";
import type { ImplementationRelease } from "ulvia-sdk/interfaces/runtime";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { storeProviderPlan, providerPlan } from "ulvia-sdk/compiler/plan";
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

/** Combine only exact approved implementations, including explicitly retained releases. */
export function selectImplementationBuilds<Dependencies>(
    builds: readonly CompiledImplementations<Dependencies>[],
    releases: readonly ImplementationRelease[],
): CompiledImplementations<Dependencies> {
    if (builds.length > 512 || releases.length > 512) {
        throw new SdkDefinitionError("Too many implementation builds");
    }
    const claims = [];
    const contracts = new Map<string, CompiledImplementations<Dependencies>["contracts"][number]>();
    const views = [];
    const plan = [];
    const seen = new Set<string>();
    for (const release of releases) {
        const key = `${release.contractId}\0${release.version}`;
        const matches = builds.filter((build) =>
            build.implementations.some(
                (claim) =>
                    claim.contractId === release.contractId &&
                    claim.version === release.version &&
                    claim.digest === release.digest,
            ),
        );
        if (seen.has(key) || matches.length !== 1) {
            throw new SdkDefinitionError(
                `Unsupported or ambiguous implementation: ${release.contractId}@${release.version}`,
            );
        }
        seen.add(key);
        const build = matches[0]!;
        const selected = selectImplementations(build, [release]);
        claims.push(
            build.implementations.find(
                (claim) =>
                    claim.contractId === release.contractId &&
                    claim.version === release.version &&
                    claim.digest === release.digest,
            )!,
        );
        views.push(...selected.contracts);
        plan.push(...selected.plan);
        for (const view of selected.contracts) {
            for (const contract of view.lineage) {
                const coordinate = `${contract.release.contractId}\0${contract.release.version}`;
                if (contracts.has(coordinate) && contracts.get(coordinate)!.digest !== contract.digest) {
                    throw new SdkDefinitionError("Conflicting exact contract coordinates");
                }
                contracts.set(coordinate, build.contracts.find((entry) => entry.digest === contract.digest)!);
            }
        }
    }
    compileProviderRoutes(views);
    const build = Object.freeze({
        implementations: Object.freeze(claims),
        contracts: Object.freeze([...contracts.values()]),
        implementedContracts: Object.freeze(views),
    }) as CompiledImplementations<Dependencies>;
    storeProviderPlan(build, plan);
    return build;
}

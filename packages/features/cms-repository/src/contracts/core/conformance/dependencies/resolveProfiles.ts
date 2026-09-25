import type { ConformanceDependencyProfile } from "../../../interfaces/Conformance";
import type { ContractRelease } from "../../../interfaces/ContractRelease";
import type { AdmittedContractRelease } from "../../admission/admitContractRelease";
import { ReleaseValidationError } from "../../protocol/errors";
import type { ReleaseLimits } from "../../protocol/limits";
import { collectCalledCapabilities } from "./calledCapabilities";
import { indexDependencyContext } from "./references";
import { assertRootBranchCoverage, resolveDependencyGraph } from "./resolveGraph";
import { indexScenarioProfiles } from "./scenarioProfiles";

export interface ResolvedConformanceProfile {
    readonly id?: string;
    readonly selected: ReadonlyMap<string, ContractRelease>;
    readonly scenarios: readonly unknown[];
    readonly rootCapabilities: readonly string[];
}

export function resolveDependencyProfiles(
    profiles: readonly ConformanceDependencyProfile[] | undefined,
    scenarios: unknown,
    root: ContractRelease,
    dependencies: readonly AdmittedContractRelease[],
    limits: Readonly<ReleaseLimits>,
): readonly ResolvedConformanceProfile[] {
    const context = indexDependencyContext(dependencies, limits);
    const indexed = indexScenarioProfiles(scenarios, profiles?.map((profile) => profile.id) ?? [], limits);
    const usedDigests = new Set<string>();
    const selections = profiles?.map((profile, index) => {
        const path = `$.dependencyProfiles[${index}]`;
        const selected = new Map<string, ContractRelease>();
        const applicable = indexed.filter((scenario) => !scenario.profiles || scenario.profiles.includes(profile.id));
        if (!applicable.length) {
            throw new ReleaseValidationError("invalid_contract", "dependency profile has no applicable scenario", path);
        }
        const authored = applicable.map((scenario) => scenario.value);
        const calls = collectCalledCapabilities(authored, root.contractId, limits);
        for (const reference of profile.releases) {
            const admission = context.get(reference.digest);
            if (
                !admission ||
                admission.release.contractId !== reference.contractId ||
                admission.release.version !== reference.version
            ) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "dependency reference does not match a supplied admitted release",
                    path,
                );
            }
            if (reference.contractId === root.contractId) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "profile cannot replace the tested contract release",
                    path,
                );
            }
            selected.set(reference.contractId, admission.release);
            usedDigests.add(reference.digest);
        }
        resolveDependencyGraph(root, selected, calls, path);
        return {
            id: profile.id,
            selected,
            scenarios: authored,
            rootCapabilities: calls
                .filter((call) => call.contractId === root.contractId)
                .map((call) => call.capabilityId),
        };
    }) ?? [
        {
            selected: new Map<string, ContractRelease>(),
            scenarios: indexed.map((entry) => entry.value),
            rootCapabilities: [] as string[],
        },
    ];
    if (!profiles) {
        const calls = collectCalledCapabilities(scenarios, root.contractId, limits);
        const hasRequirements = root.capabilities.some(
            (capability) =>
                capability.requires?.length &&
                calls.some((call) => call.contractId === root.contractId && call.capabilityId === capability.id),
        );
        if (hasRequirements) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "called capabilities require dependency profiles",
                "$.dependencyProfiles",
            );
        }
        resolveDependencyGraph(root, selections[0]!.selected, calls, "$.dependencyProfiles");
        selections[0]!.rootCapabilities.push(...calls.map((call) => call.capabilityId));
    }
    if (usedDigests.size !== context.size) {
        throw new ReleaseValidationError("invalid_contract", "unused conformance dependency artifact");
    }
    const calledRoot = root.capabilities.filter((capability) =>
        selections.some((selection) => selection.rootCapabilities.includes(capability.id)),
    );
    assertRootBranchCoverage(calledRoot, selections);
    return selections;
}

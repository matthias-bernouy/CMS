import type { CapabilityDefinition, ContractRelease } from "../../../interfaces/ContractRelease";
import { satisfiesVersionRange } from "../../compatibility/versionRange";
import { getRequirementSupportRanges } from "../../compatibility/ranges/support";
import { ReleaseValidationError } from "../../protocol/errors";
import type { CalledCapability } from "./calledCapabilities";
import type { ResolvedConformanceProfile } from "./resolveProfiles";

/** Resolve only exercised capabilities; one exact selected release must satisfy every incoming edge. */
export function resolveDependencyGraph(
    root: ContractRelease,
    selected: ReadonlyMap<string, ContractRelease>,
    calls: readonly CalledCapability[],
    path: string,
): void {
    const releases = new Map(selected).set(root.contractId, root);
    const capabilities = new Map(
        [...releases].map(([id, release]) => [
            id,
            new Map(release.capabilities.map((capability) => [capability.id, capability])),
        ]),
    );
    const used = new Set<string>();
    const completed = new Set<string>();
    const active = new Set<string>();
    const visit = (start: CalledCapability): void => {
        const stack = [{ node: start, exiting: false }];
        while (stack.length) {
            const { node, exiting } = stack.pop()!;
            const key = `${node.contractId}\u0000${node.capabilityId}`;
            if (exiting) {
                active.delete(key);
                completed.add(key);
                continue;
            }
            if (active.has(key)) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "cyclic conformance dependency requirements",
                    path,
                );
            }
            if (completed.has(key)) {
                continue;
            }
            const capability = capabilities.get(node.contractId)?.get(node.capabilityId);
            if (!capability) {
                throw new ReleaseValidationError("invalid_contract", "unknown conformance capability", node.path);
            }
            active.add(key);
            stack.push({ node, exiting: true });
            for (const requirement of capability.requires ?? []) {
                const release = releases.get(requirement.contractId);
                if (!release || !satisfiesVersionRange(release.version, requirement.versionRange)) {
                    throw new ReleaseValidationError(
                        "invalid_contract",
                        `profile does not satisfy ${requirement.contractId}:${requirement.capabilityId} ${requirement.versionRange}`,
                        path,
                    );
                }
                used.add(requirement.contractId);
                stack.push({
                    node: { contractId: requirement.contractId, capabilityId: requirement.capabilityId, path },
                    exiting: false,
                });
            }
        }
    };
    for (const call of calls.filter((entry) => entry.contractId === root.contractId)) {
        visit(call);
    }
    // Setup calls may introduce requirements of their own, but must start from an already declared dependency.
    let pending = calls.filter((entry) => entry.contractId !== root.contractId);
    while (pending.length) {
        const reachable = pending.filter((entry) => used.has(entry.contractId));
        if (!reachable.length) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "call targets an undeclared dependency contract",
                pending[0]!.path,
            );
        }
        for (const call of reachable) {
            visit(call);
        }
        const visited = new Set(reachable);
        pending = pending.filter((entry) => !visited.has(entry));
    }
    for (const contractId of selected.keys()) {
        if (!used.has(contractId)) {
            throw new ReleaseValidationError(
                "invalid_contract",
                `unused dependency profile release ${contractId}`,
                path,
            );
        }
    }
}

/** Every explicit support range needs a matching profile that actually exercises the root capability. */
export function assertRootBranchCoverage(
    capabilities: readonly CapabilityDefinition[],
    profiles: readonly ResolvedConformanceProfile[],
): void {
    for (const capability of capabilities) {
        for (const requirement of capability.requires ?? []) {
            for (const branch of getRequirementSupportRanges(requirement)) {
                if (
                    !profiles.some((profile) => {
                        const selected = profile.selected.get(requirement.contractId);
                        return (
                            profile.rootCapabilities.includes(capability.id) &&
                            selected &&
                            satisfiesVersionRange(selected.version, branch)
                        );
                    })
                ) {
                    throw new ReleaseValidationError(
                        "invalid_contract",
                        `dependency profiles do not cover ${requirement.contractId}:${requirement.capabilityId} ${branch}`,
                        "$.dependencyProfiles",
                    );
                }
            }
        }
    }
}

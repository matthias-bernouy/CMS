import { compileContractBindings, matchPathTemplate } from "cms-repository/exports/contracts/bindings";
import {
    effectiveLineageCapabilities,
    resolveContractLineage,
    type ReleaseCatalogue,
} from "cms-repository/exports/contracts/catalogue";
import { compareContractReleases, satisfiesVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { ContractSelection } from "../../interfaces/ContractSelection";
import type { CapabilityUsageEvidence, ContractUpgradeIssue } from "../../interfaces/ContractUpgrade";
import type { CapabilityGrantPolicy } from "../../interfaces/ContractSelectionStore";
import { capabilityGranted } from "../grants";
import type { ContractSelectionDependency } from "../../interfaces/ContractSelectionPlan";

async function selectedContractNodes(selections: readonly ContractSelection[], releases: ReleaseCatalogue) {
    return Promise.all(
        selections.map(async (selection) => {
            const entry = await releases.get(selection.contractId, selection.version);
            if (!entry || entry.admission.digest !== selection.digest) {
                throw new TypeError(
                    `Selected contract pin is unavailable: ${selection.contractId}@${selection.version}`,
                );
            }
            const lineage = await resolveContractLineage(releases, entry.admission.release);
            return { selection, lineage, capabilities: effectiveLineageCapabilities(lineage) };
        }),
    );
}

export async function validateCapabilityUsage(
    usage: CapabilityUsageEvidence,
    selections: readonly ContractSelection[],
    source: readonly ContractSelection[],
    grants: CapabilityGrantPolicy,
    dependencies: readonly ContractSelectionDependency[],
    releases: ReleaseCatalogue,
): Promise<ContractUpgradeIssue[]> {
    const nodes = await selectedContractNodes(selections, releases);
    const before = await selectedContractNodes(source, releases);
    const issues: ContractUpgradeIssue[] = [];
    const pending = [...usage.requirements];
    const expanded = new Set<string>();
    for (const denial of grants.denied) {
        if (
            !nodes.some(
                (node) =>
                    node.selection.contractId === denial.contractId &&
                    node.capabilities.some(({ id }) => id === denial.capabilityId),
            )
        ) {
            issues.push({
                code: "invalid-grant",
                location: `grants/${denial.contractId}/${denial.capabilityId}`,
                message: "A grant must name a capability in the target selections",
            });
        }
    }
    while (pending.length) {
        if (pending.length + expanded.size > 100_000) {
            issues.push({
                code: "incomplete",
                location: "requirements",
                message: "Capability requirement inventory exceeds its bound",
            });
            break;
        }
        const reference = pending.shift()!;
        const node = nodes.find((candidate) =>
            candidate.lineage.some((release) => release.contractId === reference.contractId),
        );
        const contract = node?.lineage.find((release) => release.contractId === reference.contractId);
        const capability = node ? capabilityForReference(node, reference) : undefined;
        if (
            !node ||
            !contract ||
            !capability ||
            (reference.versionRange !== undefined && !satisfiesVersionRange(contract.version, reference.versionRange))
        ) {
            const oldNodeForMissing = before.find((candidate) =>
                candidate.lineage.some((release) => release.contractId === reference.contractId),
            );
            const old = oldNodeForMissing ? capabilityForReference(oldNodeForMissing, reference) : undefined;
            issues.push({
                code: "required-capability",
                location: reference.location,
                message: `Target does not support required capability ${reference.contractId}:${reference.capabilityId} ${reference.versionRange}`,
                ...(old?.deprecation?.replacedBy ? { replacement: old.deprecation.replacedBy } : {}),
            });
            continue;
        }
        const oldNode = before.find((candidate) =>
            candidate.lineage.some((release) => release.contractId === reference.contractId),
        );
        const oldContract = oldNode?.lineage.find((release) => release.contractId === reference.contractId);
        const oldCapability = oldNode ? capabilityForReference(oldNode, reference) : undefined;
        if (oldContract && oldCapability) {
            const { extends: _oldParent, ...oldBase } = oldContract;
            const { extends: _targetParent, ...targetBase } = contract;
            const compatibility = compareContractReleases(
                { ...oldBase, capabilities: [oldCapability] },
                { ...targetBase, capabilities: [capability] },
            );
            if (!compatibility.consumerCompatible) {
                issues.push({
                    code: "incompatible-capability",
                    location: reference.location,
                    message: `Required capability ${reference.contractId}:${reference.capabilityId} changes its consumer contract`,
                    ...(oldCapability.deprecation?.replacedBy
                        ? { replacement: oldCapability.deprecation.replacedBy }
                        : {}),
                });
            }
        }
        if (!capabilityGranted(grants, node.selection.contractId, capability.id)) {
            issues.push({
                code: "required-grant",
                location: reference.location,
                message: `Required capability ${reference.contractId}:${reference.capabilityId} cannot be denied`,
            });
        }
        const key = `${node.selection.contractId}:${capability.id}`;
        if (expanded.has(key)) {
            continue;
        }
        expanded.add(key);
        for (const requirement of capability.requires ?? []) {
            pending.push({ ...requirement, location: `${reference.location}/requires/${capability.id}` });
        }
        for (const dependency of dependencies.filter(
            (item) =>
                item.source === "implementation" && item.fromContractId === node.selection.contractId && !item.optional,
        )) {
            pending.push({
                contractId: dependency.contractId,
                capabilityId: dependency.capabilityId,
                versionRange: dependency.versionRange,
                location: `${reference.location}/provider-requires`,
            });
        }
    }
    return issues;
}

function capabilityForReference(
    node: Awaited<ReturnType<typeof selectedContractNodes>>[number],
    reference: CapabilityUsageEvidence["requirements"][number],
) {
    if (reference.capabilityId) {
        return node.capabilities.find(({ id }) => id === reference.capabilityId);
    }
    if (!reference.bindingPath) {
        return undefined;
    }
    const release = node.lineage[0]!;
    const match = compileContractBindings({ ...release, capabilities: node.capabilities }).find(
        ({ binding }) => binding.method === "GET" && matchPathTemplate(binding.path, reference.bindingPath!) !== null,
    );
    return node.capabilities.find(({ id }) => id === match?.capabilityId);
}

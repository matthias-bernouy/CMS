import { compareOrdinal } from "cms-repository/providers/manifests/core/protocol/values";
import { delegationAllows } from "cms-repository/providers/manifests/core/delegation/delegationAllows";
import type { ResolvedSelection } from "../graph/resolveSelections";
import type { AuthorityCapability, SelectionAuthority } from "../../interfaces/SelectionAuthority";

/** Concrete wildcard expansion is reviewable and bound to exact source/target artifacts. */
export function selectionAuthority(resolved: ReadonlyMap<string, ResolvedSelection>): SelectionAuthority {
    const providers = new Map<string, string>();
    const machine: SelectionAuthority["machine"][number][] = [];
    const delegated: SelectionAuthority["delegated"][number][] = [];
    const capabilities = [...resolved.values()].flatMap((node) =>
        node.lineage.flatMap((release, index) =>
            release.capabilities.map((capability) => ({
                node,
                capability,
                entry: {
                    selection: node.selection,
                    contractId: release.contractId,
                    version: release.version,
                    digest: index === 0 ? node.selection.digest : node.lineage[index - 1]!.extends!.digest,
                    capabilityId: capability.id,
                    effect: capability.behavior.effect,
                    sensitive: capability.behavior.sensitive,
                    access: capability.access,
                } satisfies AuthorityCapability,
            })),
        ),
    );
    for (const node of resolved.values()) {
        const first = !providers.has(node.selection.installationId);
        providers.set(node.selection.installationId, node.manifestDigest);
        const requirements = [
            ...(first ? node.providerRequires.map((requirement) => ({ requirement })) : []),
            ...node.implementation.requires.map((requirement) => ({
                requirement,
                fromContractId: node.selection.contractId,
            })),
        ];
        for (const { requirement, ...origin } of requirements) {
            for (const target of capabilities) {
                if (
                    requirement.contractId === target.entry.contractId &&
                    requirement.capabilityId === target.entry.capabilityId
                ) {
                    if (machine.length >= 1024) {
                        throw new TypeError("Machine authority expansion exceeds 1024 capability grants");
                    }
                    machine.push({ installationId: node.selection.installationId, ...origin, target: target.entry });
                }
            }
        }
        if (node.implementation.delegation) {
            for (const source of capabilities.filter((item) => item.node === node)) {
                for (const target of capabilities) {
                    if (
                        delegationAllows(
                            node.implementation.delegation,
                            source.capability,
                            target.entry.contractId,
                            target.capability,
                        )
                    ) {
                        delegated.push({ source: source.entry, target: target.entry });
                        if (delegated.length > 1024) {
                            throw new TypeError("Delegation expansion exceeds 1024 capability pairs");
                        }
                    }
                }
            }
        }
    }
    const stable = <T>(items: T[]): T[] =>
        items.sort((left, right) => compareOrdinal(JSON.stringify(left), JSON.stringify(right)));
    return {
        providers: [...providers]
            .map(([installationId, manifestDigest]) => ({ installationId, manifestDigest }))
            .sort((left, right) => compareOrdinal(left.installationId, right.installationId)),
        machine: stable(machine),
        delegated: stable(delegated),
    };
}

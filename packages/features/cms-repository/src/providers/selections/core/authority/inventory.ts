import { MAX_AUTHORITY_GRANTS } from "../limits";
import { compareOrdinal } from "cms-repository/providers/manifests/core/protocol/values";
import { authorityCapabilities, delegatedPairs } from "./capabilities";
import type { ResolvedSelection } from "../graph/resolveSelections";
import type { AuthorityCapability, SelectionAuthority } from "../../interfaces/SelectionAuthority";

/** Concrete wildcard expansion is reviewable and bound to exact source/target artifacts. */
export function selectionAuthority(resolved: ReadonlyMap<string, ResolvedSelection>): SelectionAuthority {
    const providers = new Map<string, string>();
    const machine: SelectionAuthority["machine"][number][] = [];
    const delegated: SelectionAuthority["delegated"][number][] = [];
    const entries: AuthorityCapability[] = [];
    const ids = new Map<string, number>();
    const register = (entry: AuthorityCapability): number => {
        const key = JSON.stringify(entry);
        let index = ids.get(key);
        if (index === undefined) {
            index = entries.length;
            ids.set(key, index);
            entries.push(entry);
        }
        return index;
    };
    const capabilities = [...resolved.values()].flatMap((node) =>
        authorityCapabilities(node.selection, node.lineage).map((candidate) => ({ ...candidate, node })),
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
                    if (machine.length >= MAX_AUTHORITY_GRANTS) {
                        throw new TypeError("Machine authority expansion exceeds 1024 capability grants");
                    }
                    machine.push({
                        installationId: node.selection.installationId,
                        ...origin,
                        target: register(target.entry),
                    });
                }
            }
        }
        for (const pair of delegatedPairs(
            node.implementation.delegation,
            capabilities.filter((item) => item.node === node),
            capabilities,
        )) {
            if (delegated.length >= MAX_AUTHORITY_GRANTS) {
                throw new TypeError("Delegation expansion exceeds the capability pair limit");
            }
            delegated.push({ source: register(pair.source), target: register(pair.target) });
        }
    }

    const stable = <T>(items: T[]): T[] =>
        items.sort((left, right) => compareOrdinal(JSON.stringify(left), JSON.stringify(right)));
    return {
        providers: [...providers]
            .map(([installationId, manifestDigest]) => ({ installationId, manifestDigest }))
            .sort((left, right) => compareOrdinal(left.installationId, right.installationId)),
        capabilities: entries,
        machine: stable(machine),
        delegated: stable(delegated),
    };
}

/** Compare exact reviewed pins independently of their compact table positions. */
export function delegationKey(authority: SelectionAuthority, pair: SelectionAuthority["delegated"][number]): string {
    return JSON.stringify([authority.capabilities[pair.source], authority.capabilities[pair.target]]);
}

import type { ProviderManifest } from "cms-repository/providers/manifests/interfaces/ProviderManifest";
import type { ContractSelection } from "../../interfaces/ContractSelection";
import type { SelectionAuthority } from "../../interfaces/SelectionAuthority";
import type { CapabilityGrantPolicy } from "../../interfaces/ContractSelectionStore";
import { capabilityGranted } from "../grants";

/** Apply site policy to the review projection without changing immutable manifest declarations. */
export function grantedAuthority(authority: SelectionAuthority, grants: CapabilityGrantPolicy): SelectionAuthority {
    const allowed = (index: number) => {
        const target = authority.capabilities[index];
        return Boolean(target && capabilityGranted(grants, target.selection.contractId, target.capabilityId));
    };
    const capabilities: SelectionAuthority["capabilities"][number][] = [];
    const indices = new Map<number, number>();
    const retain = (index: number) => {
        let compact = indices.get(index);
        if (compact === undefined) {
            compact = capabilities.length;
            indices.set(index, compact);
            capabilities.push(authority.capabilities[index]!);
        }
        return compact;
    };
    const machine = authority.machine
        .filter(({ target }) => allowed(target))
        .map((entry) => ({ ...entry, target: retain(entry.target) }));
    const delegated = authority.delegated
        .filter(({ source, target }) => allowed(source) && allowed(target))
        .map((entry) => ({ source: retain(entry.source), target: retain(entry.target) }));
    return { providers: authority.providers, capabilities, machine, delegated };
}

/** Only selected exact implementations contribute installation machine rights. */
export function activeProviderRequirements(
    manifest: ProviderManifest,
    selections: readonly ContractSelection[],
    installationId: string,
) {
    return [
        ...manifest.requires,
        ...manifest.implementations
            .filter((implementation) =>
                selections.some(
                    (selection) =>
                        selection.installationId === installationId &&
                        selection.contractId === implementation.contractId &&
                        selection.version === implementation.version &&
                        selection.digest === implementation.digest,
                ),
            )
            .flatMap((implementation) => implementation.requires),
    ];
}

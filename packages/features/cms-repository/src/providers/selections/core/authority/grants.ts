import type { SelectionAuthority } from "../../interfaces/SelectionAuthority";
import type { CapabilityGrantPolicy } from "../../interfaces/ContractSelectionStore";
import { capabilityGranted } from "../grants";

/** Apply site policy to the review projection without changing immutable manifest declarations. */
export function grantedAuthority(authority: SelectionAuthority, grants: CapabilityGrantPolicy): SelectionAuthority {
    const allowed = (target: SelectionAuthority["machine"][number]["target"]) =>
        capabilityGranted(grants, target.selection.contractId, target.capabilityId);
    return {
        providers: authority.providers,
        machine: authority.machine.filter(({ target }) => allowed(target)),
        delegated: authority.delegated.filter(({ source, target }) => allowed(source) && allowed(target)),
    };
}

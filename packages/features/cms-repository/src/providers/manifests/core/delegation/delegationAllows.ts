import type { CapabilityDefinition } from "cms-repository/exports/contracts/index";
import type { ProviderDelegationPolicy } from "../../interfaces/ProviderManifest";

/** Matching never creates authority: actor authorization and live selections are checked separately. */
export function delegationAllows(
    policy: ProviderDelegationPolicy | undefined,
    source: Pick<CapabilityDefinition, "id" | "behavior">,
    contractId: string,
    target: Pick<CapabilityDefinition, "id" | "behavior">,
): boolean {
    if (!policy || (!policy.sources.includes("*") && !policy.sources.includes(source.id))) {
        return false;
    }
    if (source.behavior.effect === "query" && target.behavior.effect !== "query") {
        return false;
    }
    return policy.allow.some(
        (rule) =>
            (rule.contractId === "*" || rule.contractId === contractId) &&
            (rule.capabilityId === "*" || rule.capabilityId === target.id) &&
            (rule.effect === "*" || rule.effect === target.behavior.effect) &&
            (rule.sensitive === undefined || rule.sensitive === target.behavior.sensitive),
    );
}

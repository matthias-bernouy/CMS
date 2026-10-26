import { compareOrdinal } from "cms-repository/providers/manifests/core/values";
import { assertIJson, deepFreeze } from "cms-repository/exports/contracts/protocol";
import type { CapabilityGrantPolicy } from "../interfaces/ContractSelectionStore";

export function parseCapabilityGrants(value: unknown): CapabilityGrantPolicy {
    assertIJson(value, 8);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Capability grants must be an object");
    }
    const source = value as Record<string, unknown>;
    if (
        Object.keys(source).some((key) => !["default", "denied"].includes(key)) ||
        source.default !== "allow-selected" ||
        !Array.isArray(source.denied) ||
        source.denied.length > 4096
    ) {
        throw new TypeError("Capability grants require allow-selected and a bounded denied list");
    }
    const denied = source.denied.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw new TypeError("Invalid capability grant");
        }
        const reference = entry as Record<string, unknown>;
        if (
            Object.keys(reference).some((key) => !["contractId", "capabilityId"].includes(key)) ||
            [reference.contractId, reference.capabilityId].some(
                (id) => typeof id !== "string" || id.length > 128 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id),
            )
        ) {
            throw new TypeError("Invalid capability grant identity");
        }
        return { contractId: reference.contractId as string, capabilityId: reference.capabilityId as string };
    });
    const keys = denied.map(({ contractId, capabilityId }) => `${contractId}:${capabilityId}`);
    if (new Set(keys).size !== keys.length) {
        throw new TypeError("Duplicate capability grants");
    }
    return deepFreeze({
        default: "allow-selected",
        denied: denied.sort((a, b) =>
            compareOrdinal(`${a.contractId}:${a.capabilityId}`, `${b.contractId}:${b.capabilityId}`),
        ),
    });
}
export function capabilityGranted(policy: CapabilityGrantPolicy, contractId: string, capabilityId: string): boolean {
    return (
        policy.default === "allow-selected" &&
        !policy.denied.some((denial) => denial.contractId === contractId && denial.capabilityId === capabilityId)
    );
}

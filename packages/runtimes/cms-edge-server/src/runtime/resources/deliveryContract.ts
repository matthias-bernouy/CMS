import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { GatewayError } from "@bernouy/cms-gateway";

/** Discover the effective surface while preserving the declaring contract's exact identity. */
export async function resolveDeliveryContract(gateway: GatewayInvoker): Promise<AdmittedContractRelease | undefined> {
    if (!gateway.resolveContract) {
        return undefined;
    }
    let current = await gateway.resolveContract?.({ siteId: "default", contractId: "ulvia/cms.content" });
    const visited = new Set<string>();
    while (current) {
        if (visited.has(current.release.contractId) || visited.size >= 256) {
            throw new GatewayError("invalid_route", "Invalid Delivery contract lineage");
        }
        visited.add(current.release.contractId);
        if (current.release.capabilities.some(({ id }) => id === "delivery.resolve-resource")) {
            return current;
        }
        const parent = current.release.extends;
        if (!parent) {
            break;
        }
        current = await gateway.resolveContract!({ siteId: "default", contractId: parent.contractId });
        if (
            current.release.contractId !== parent.contractId ||
            current.release.version !== parent.version ||
            current.digest !== parent.digest
        ) {
            throw new GatewayError("stale_route", "Delivery parent does not match its exact pin");
        }
    }
    throw new GatewayError("invalid_route", "The selected contract does not expose delivery.resolve-resource");
}

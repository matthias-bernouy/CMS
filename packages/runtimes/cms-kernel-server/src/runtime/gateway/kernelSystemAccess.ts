import type { GatewayActor } from "@bernouy/cms-gateway";

/** Runtime-owned machine consumers. User authorization is resolved separately from live Access state. */
export function kernelSystemMayInvoke(actor: GatewayActor, contractId: string, capabilityId: string): boolean {
    if (actor.kind !== "system") {
        return true;
    }
    if (actor.serviceId !== "cms-kernel") {
        return false;
    }
    return (
        (contractId === "ulvia.cms.observability" && capabilityId === "logs.append") ||
        (contractId === "ulvia.cms.content" &&
            ["delivery.read", "delivery.robots", "delivery.sitemap", "delivery.collection-asset"].includes(
                capabilityId,
            ))
    );
}

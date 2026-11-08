import type { GatewayActor, GatewayTransportRequest } from "@bernouy/cms-gateway";

/** A full-site administrative review can outlive ordinary interactive reads. Authority TTLs stay unchanged. */
export function responseTimeout(
    request: Pick<GatewayTransportRequest, "release" | "capability" | "delegated">,
    actor: GatewayActor,
): number {
    return actor.kind === "administrator" &&
        !request.delegated &&
        request.release.contractId === "ulvia/cms.installations" &&
        request.capability.id === "plan-collection-upgrade" &&
        request.capability.behavior.effect === "query"
        ? 60_000
        : 15_000;
}

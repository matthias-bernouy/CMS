import type { GatewayActor, GatewayTransportRequest } from "@bernouy/cms-gateway";

/** Only direct administrator workflows may outlive ordinary interactive reads. Authority TTLs stay unchanged. */
export function responseTimeout(
    request: Pick<GatewayTransportRequest, "release" | "capability" | "delegated">,
    actor: GatewayActor,
): number {
    if (actor.kind !== "administrator" || request.delegated || request.capability.behavior.effect !== "query") {
        return 15_000;
    }
    const contract = request.release.contractId;
    const capability = request.capability.id;
    if (contract === "ulvia/cms.installations" && capability === "plan-collection-upgrade") {
        return 60_000;
    }
    // A bounded capture worker can take 20 seconds; its Unix client has a 25-second deadline.
    if (
        (contract === "ulvia/cms.content" && (capability === "pages.capture" || capability === "examples.capture")) ||
        (contract === "ulvia/cms.authoring" && capability === "capture-prepared-example")
    ) {
        return 30_000;
    }
    return 15_000;
}

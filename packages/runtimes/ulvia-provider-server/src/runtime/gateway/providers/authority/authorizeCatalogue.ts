import type { CapabilityGateway, GatewayActor } from "@bernouy/cms-gateway";
import { inspectDelegationActor } from "./delegations";

/** Access remains a separate contract call through the Gateway, followed by the ordinary current admin grant check. */
export async function authorizeCatalogue(
    invoker: CapabilityGateway,
    siteId: string,
    actor: GatewayActor,
): Promise<void> {
    if (actor.kind !== "user" && actor.kind !== "administrator") {
        throw Object.assign(new Error("MCP catalogue requires a current user"), { status: 403 });
    }
    const current = await inspectDelegationActor(invoker, siteId, actor);
    if (
        !current ||
        current.kind !== actor.kind ||
        !(current.kind === "user" || current.kind === "administrator") ||
        current.subjectId !== actor.subjectId ||
        (actor.authorizationRevision !== undefined && current.authorizationRevision !== actor.authorizationRevision)
    ) {
        throw Object.assign(new Error("MCP catalogue actor changed"), { status: 403 });
    }
    await invoker.assertAuthorized({
        siteId,
        contractId: "ulvia/cms.installations",
        capabilityId: "list-provider-installations",
        actor: current,
    });
}

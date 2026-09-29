import { GatewayError, type GatewayActor } from "@bernouy/cms-gateway";
import type DeliveryCms from "cms-delivery/DeliveryCms";

/** Invokes the selected release directly; no public HTTP route or Source proxy is involved. */
export async function executeIndexingCapability(
    delivery: DeliveryCms,
    request: Request,
    contractId: string,
    capabilityId: string,
    input: Readonly<Record<string, string | number>>,
    anonymous = false,
): Promise<Response> {
    const gateway = delivery.capabilityGateway;
    if (!gateway) {
        return new Response(null, { status: 503 });
    }
    let actor: GatewayActor = { kind: "anonymous" };
    if (!anonymous) {
        const subject = await delivery.auth?.subject(request).catch(() => null);
        if (subject) {
            actor = { kind: "user", subjectId: subject.identifier };
        }
    }
    try {
        const result = await gateway.invoker.invoke({
            siteId: gateway.siteId,
            contractId,
            capabilityId,
            input,
            origin: "delivery",
            actor,
        });
        if (result.kind === "binary") {
            return new Response(null, { status: 502 });
        }
        return Response.json(result.output ?? null, { status: result.status });
    } catch (error) {
        if (error instanceof GatewayError) {
            const status = error.code === "invalid_input" ? 400 : error.code === "not_authorized" ? 403 : 503;
            return new Response(null, { status });
        }
        return new Response(null, { status: 503 });
    }
}

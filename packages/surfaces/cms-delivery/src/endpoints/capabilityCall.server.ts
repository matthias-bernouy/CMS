import { type GatewayActor } from "@bernouy/cms-gateway";
import { handleGatewayFileGet, handleGatewayHttpCall } from "@bernouy/cms-gateway/handlers";
import type DeliveryCms from "cms-delivery/DeliveryCms";

/** Public surface decides the verified actor; gateway HTTP owns parsing and projection. */
export async function handleCapabilityCall(request: Request, delivery: DeliveryCms): Promise<Response> {
    const configured = delivery.capabilityGateway;
    if (!configured) {
        return new Response(null, { status: 404 });
    }
    const actor = await deliveryActor(delivery, request);
    return handleGatewayHttpCall(request, {
        siteId: configured.siteId,
        invoker: configured.invoker,
        origin: "delivery",
        actor,
        prefix: `${delivery.basePath}/.cms/call`,
    });
}

export async function handleCapabilityFile(request: Request, delivery: DeliveryCms): Promise<Response> {
    const configured = delivery.capabilityGateway;
    if (!configured) {
        return new Response(null, { status: 404 });
    }
    return handleGatewayFileGet(request, {
        siteId: configured.siteId,
        invoker: configured.invoker,
        origin: "delivery",
        actor: await deliveryActor(delivery, request),
        prefix: `${delivery.basePath}/.cms/media`,
    });
}

async function deliveryActor(delivery: DeliveryCms, request: Request): Promise<GatewayActor> {
    if (!delivery.auth) {
        return { kind: "anonymous" };
    }
    const subject = await delivery.auth.subject(request).catch(() => null);
    return subject ? { kind: "user", subjectId: subject.identifier } : { kind: "anonymous" };
}

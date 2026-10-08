import { type GatewayActor } from "@bernouy/cms-gateway";
import { handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import type DeliveryCms from "cms-delivery/DeliveryCms";

/** Public surface decides the verified actor; gateway HTTP owns parsing and projection. */
export async function handleCapabilityCall(request: Request, delivery: DeliveryCms): Promise<Response> {
    const configured = delivery.capabilityGateway;
    if (!configured) {
        return new Response(null, { status: 404 });
    }
    const providerInstallationId = await providerActor(delivery, request);
    const actor = providerInstallationId
        ? ({ kind: "provider", installationId: providerInstallationId } as const)
        : await deliveryActor(delivery, request);
    return handleGatewayHttpCall(request, {
        siteId: configured.siteId,
        invoker: configured.invoker,
        origin: providerInstallationId ? "provider" : "delivery",
        actor,
        prefix: `${delivery.basePath}/.cms/call`,
    });
}

async function providerActor(delivery: DeliveryCms, request: Request): Promise<string | null> {
    const authenticate = delivery.capabilityGateway?.authenticateProvider;
    const authorization = request.headers.get("authorization");
    if (!authenticate || !authorization?.startsWith("Bearer ")) {
        return null;
    }
    return authenticate(authorization.slice(7)).catch(() => null);
}

async function deliveryActor(delivery: DeliveryCms, request: Request): Promise<GatewayActor> {
    if (!delivery.auth) {
        return { kind: "anonymous" };
    }
    const subject = await delivery.auth.subject(request).catch(() => null);
    return subject ? { kind: "user", subjectId: subject.identifier } : { kind: "anonymous" };
}

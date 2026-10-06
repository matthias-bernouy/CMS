import type { TPage } from "@bernouy/cms-content/rendering";
import { collectCmsSourceBindings } from "@bernouy/cms-content/rendering";
import { GatewayError, type GatewayActor } from "@bernouy/cms-gateway";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { renderRef } from "cms-delivery/core/pages/renderRef";

/** Checks automatic page capabilities before rendering protected content. */
export async function preflightPageGatewayAccess(
    request: Request,
    page: TPage,
    delivery: DeliveryCms,
): Promise<Response | null> {
    const configured = delivery.capabilityGateway;
    if (!configured?.access) {
        return null;
    }
    const url = new URL(request.url);
    const prefix = `${delivery.basePath.replace(/\/$/, "")}/.cms/call/`;
    let actor: GatewayActor | undefined;
    for (const binding of collectCmsSourceBindings(page.content)) {
        if (binding.trigger === "submit") {
            continue;
        }
        const identifiers = capabilityIdentifiers(binding.url, url, prefix);
        if (!identifiers) {
            continue;
        }
        actor ??= await deliveryActor(delivery, request);
        try {
            await configured.access.assertAuthorized({
                siteId: configured.siteId,
                contractId: identifiers.contractId,
                capabilityId: identifiers.capabilityId,
                origin: "delivery",
                actor,
            });
        } catch (error) {
            if (error instanceof GatewayError && error.code === "not_authorized") {
                return accessDenied(request, delivery, actor.kind === "anonymous" ? 401 : 403);
            }
            if (error instanceof GatewayError && error.code === "not_selected") {
                continue;
            }
            return new Response("Service unavailable", { status: 503, headers: { "cache-control": "no-store" } });
        }
    }
    return null;
}

function capabilityIdentifiers(
    rawUrl: string,
    requestUrl: URL,
    prefix: string,
): { contractId: string; capabilityId: string } | null {
    try {
        const url = new URL(rawUrl, requestUrl);
        if (url.origin !== requestUrl.origin || !url.pathname.startsWith(prefix)) {
            return null;
        }
        const parts = url.pathname.slice(prefix.length).split("/");
        if (parts.length !== 2 || parts.some((part) => !part)) {
            return null;
        }
        const [contractId, capabilityId] = parts.map(decodeURIComponent);
        return contractId && capabilityId ? { contractId, capabilityId } : null;
    } catch {
        return null;
    }
}

async function deliveryActor(delivery: DeliveryCms, request: Request): Promise<GatewayActor> {
    const subject = await delivery.auth?.subject(request).catch(() => null);
    return subject ? { kind: "user", subjectId: subject.identifier } : { kind: "anonymous" };
}

async function accessDenied(request: Request, delivery: DeliveryCms, status: 401 | 403): Promise<Response> {
    if (status === 401 && delivery.auth) {
        const url = new URL(request.url);
        const returnTo = `${url.pathname}${url.search}`;
        const settings = await delivery.repository.getRenderingSettings().catch(() => null);
        const loginRef = settings?.site.login;
        const loginPage = loginRef ? await delivery.repository.getPublishedPageById(loginRef.pageId) : null;
        const loginPath = loginPage?.path;
        if (loginPath === url.pathname) {
            return new Response("Unauthorized", { status });
        }
        const location = loginPath
            ? `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`
            : delivery.auth.buildLoginUrl(returnTo);
        return new Response(null, { status: 302, headers: { Location: location } });
    }
    return status === 403
        ? renderRef(request, delivery, "forbidden", 403, "Forbidden")
        : new Response("Unauthorized", { status });
}

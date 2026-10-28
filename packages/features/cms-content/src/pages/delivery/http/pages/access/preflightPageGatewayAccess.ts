import type { RenderablePage, RenderingSettings } from "@bernouy/cms-content/rendering";
import { pageRequiresCapabilityAnalysis } from "cms-content/pages/delivery/access/PageCapabilityAnalyzer";
import type ContentDeliveryHost from "cms-content/pages/delivery/interfaces";
import { renderRef } from "cms-content/pages/delivery/http/pages/renderRef";
import { resolveRequestActor } from "./resolveRequestActor";

export type PageAccess = "public" | "authenticated" | "admin";
export type PageAccessDecision = {
    readonly access: PageAccess;
    readonly cacheable: boolean;
    readonly settings?: RenderingSettings;
    readonly response?: Response;
};

const capabilityDecisions = new WeakMap<ContentDeliveryHost, WeakMap<RenderablePage, Promise<PageAccessDecision>>>();

/** Derives Page access from every direct and transitively used capability. */
export async function preflightPageGatewayAccess(
    request: Request,
    renderable: RenderablePage,
    delivery: ContentDeliveryHost,
    minimumAccess: PageAccess = "public",
    renderingSettings?: RenderingSettings,
): Promise<PageAccessDecision> {
    const capabilityDecision = await capabilityAccess(renderable, delivery);
    if (capabilityDecision.response) {
        return capabilityDecision;
    }
    const settings = renderingSettings ?? (await delivery.content.getRenderingSettings().catch(() => null));
    if (!settings) {
        return unavailable();
    }
    const isLoginPage = settings.site.login !== null && samePageReference(settings.site.login, renderable.reference);
    const pageAccess =
        !settings.site.visible && !isLoginPage
            ? highestAccess(capabilityDecision.access, "authenticated")
            : capabilityDecision.access;
    const required = highestAccess(pageAccess, minimumAccess);
    const decision = await authorizeAccess(request, delivery, required, settings);
    return { ...decision, cacheable: decision.cacheable && !isLoginPage, settings };
}

async function capabilityAccess(
    renderable: RenderablePage,
    delivery: ContentDeliveryHost,
): Promise<PageAccessDecision> {
    let decisions = capabilityDecisions.get(delivery);
    if (!decisions) {
        decisions = new WeakMap();
        capabilityDecisions.set(delivery, decisions);
    }
    const cached = decisions.get(renderable);
    if (cached) {
        return cached;
    }
    const pending = computeCapabilityAccess(renderable, delivery);
    decisions.set(renderable, pending);
    const decision = await pending;
    if (decision.response && decisions.get(renderable) === pending) {
        decisions.delete(renderable);
    }
    return decision;
}

async function computeCapabilityAccess(
    renderable: RenderablePage,
    delivery: ContentDeliveryHost,
): Promise<PageAccessDecision> {
    if (!pageRequiresCapabilityAnalysis({ page: renderable.page, requirements: renderable.requirements })) {
        return { access: "public", cacheable: true };
    }
    const analysis = delivery.pageCapabilities;
    if (!analysis) {
        return unavailable();
    }
    const required = await analysis
        .requiredAccess({ page: renderable.page, requirements: renderable.requirements })
        .catch(() => null);
    if (!required) {
        return unavailable();
    }
    return { access: required, cacheable: required === "public" };
}

async function authorizeAccess(
    request: Request,
    delivery: ContentDeliveryHost,
    required: PageAccess,
    settings: RenderingSettings,
): Promise<PageAccessDecision> {
    if (required === "public") {
        return { access: "public", cacheable: true };
    }
    const actor = await resolveRequestActor(delivery, request).catch(() => null);
    if (!actor) {
        return unavailable();
    }
    if (required === "authenticated" && actor.kind === "anonymous") {
        return { access: required, cacheable: false, response: await accessDenied(request, delivery, settings, 401) };
    }
    if (required === "admin" && actor.kind !== "administrator") {
        return {
            access: required,
            cacheable: false,
            response: await accessDenied(request, delivery, settings, actor.kind === "anonymous" ? 401 : 403),
        };
    }
    return { access: required, cacheable: false };
}

function samePageReference(left: RenderablePage["reference"], right: RenderablePage["reference"]): boolean {
    return left.pageId === right.pageId;
}

function highestAccess(left: PageAccess, right: PageAccess): PageAccess {
    const rank: Record<PageAccess, number> = { public: 0, authenticated: 1, admin: 2 };
    return rank[left] >= rank[right] ? left : right;
}

function unavailable(): PageAccessDecision {
    return {
        access: "public",
        cacheable: false,
        response: new Response("Service unavailable", {
            status: 503,
            headers: { "cache-control": "no-store" },
        }),
    };
}

async function accessDenied(
    request: Request,
    delivery: ContentDeliveryHost,
    settings: RenderingSettings,
    status: 401 | 403,
): Promise<Response> {
    if (status === 401) {
        const url = new URL(request.url);
        const returnTo = `${url.pathname}${url.search}`;
        const loginRef = settings.site.login;
        const loginPath = loginRef ? await delivery.content.resolvePageReference(loginRef) : null;
        if (loginRef && !loginPath) {
            return unavailable().response!;
        }
        if (loginPath === url.pathname) {
            return new Response("Unauthorized", { status, headers: { "cache-control": "no-store" } });
        }
        if (!loginPath) {
            return unavailable().response!;
        }
        const location = `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`;
        return new Response(null, { status: 302, headers: { Location: location, "cache-control": "no-store" } });
    }
    return renderRef(request, delivery, "forbidden", 403, "Forbidden");
}

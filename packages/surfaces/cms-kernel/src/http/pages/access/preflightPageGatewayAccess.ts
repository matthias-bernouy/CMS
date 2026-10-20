import type { RenderablePage } from "@bernouy/cms-content/rendering";
import { pageRequiresCapabilityAnalysis } from "@bernouy/cms-gateway/analysis";
import type KernelCms from "cms-kernel/KernelCms";
import { renderRef } from "cms-kernel/http/pages/renderRef";
import { resolveRequestActor } from "./resolveRequestActor";

export type PageAccess = "public" | "authenticated" | "admin";
export type PageAccessDecision = {
    readonly access: PageAccess;
    readonly cacheable: boolean;
    readonly response?: Response;
};

/** Derives Page access from every direct and transitively used capability. */
export async function preflightPageGatewayAccess(
    request: Request,
    renderable: RenderablePage,
    kernel: KernelCms,
): Promise<PageAccessDecision> {
    const capabilityDecision = await capabilityAccess(renderable, kernel);
    if (capabilityDecision.response) {
        return capabilityDecision;
    }
    const settings = await kernel.content.getRenderingSettings().catch(() => null);
    if (!settings) {
        return unavailable();
    }
    const isLoginPage = settings.site.login !== null && samePageReference(settings.site.login, renderable.reference);
    const required =
        !settings.site.visible && !isLoginPage
            ? highestAccess(capabilityDecision.access, "authenticated")
            : capabilityDecision.access;
    const decision = await authorizeAccess(request, kernel, required);
    return { ...decision, cacheable: decision.cacheable && !isLoginPage };
}

async function capabilityAccess(renderable: RenderablePage, kernel: KernelCms): Promise<PageAccessDecision> {
    const analysis = kernel.pageCapabilities;
    if (!analysis) {
        if (!pageRequiresCapabilityAnalysis({ page: renderable.page, requirements: renderable.requirements })) {
            return { access: "public", cacheable: true };
        }
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

async function authorizeAccess(request: Request, kernel: KernelCms, required: PageAccess): Promise<PageAccessDecision> {
    if (required === "public") {
        return { access: "public", cacheable: true };
    }
    const actor = await resolveRequestActor(kernel, request);
    if (required === "authenticated" && actor.kind === "anonymous") {
        return { access: required, cacheable: false, response: await accessDenied(request, kernel, 401) };
    }
    if (required === "admin" && actor.kind !== "administrator") {
        return {
            access: required,
            cacheable: false,
            response: await accessDenied(request, kernel, actor.kind === "anonymous" ? 401 : 403),
        };
    }
    return { access: required, cacheable: false };
}

function samePageReference(left: RenderablePage["reference"], right: RenderablePage["reference"]): boolean {
    if (left.kind !== right.kind) {
        return false;
    }
    if (left.kind === "site" && right.kind === "site") {
        return left.pageId === right.pageId;
    }
    return (
        left.kind === "contribution" &&
        right.kind === "contribution" &&
        left.sourceId === right.sourceId &&
        left.contributionId === right.contributionId &&
        left.pageId === right.pageId
    );
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

async function accessDenied(request: Request, kernel: KernelCms, status: 401 | 403): Promise<Response> {
    if (status === 401) {
        const url = new URL(request.url);
        const returnTo = `${url.pathname}${url.search}`;
        const settings = await kernel.content.getRenderingSettings().catch(() => null);
        const loginRef = settings?.site.login;
        const loginPath = loginRef ? await kernel.content.resolvePageReference(loginRef) : null;
        if (loginRef && !loginPath) {
            return unavailable().response!;
        }
        if (loginPath === url.pathname) {
            return new Response("Unauthorized", { status, headers: { "cache-control": "no-store" } });
        }
        const location = loginPath
            ? `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`
            : kernel.authentication.buildLoginUrl(returnTo);
        return new Response(null, { status: 302, headers: { Location: location, "cache-control": "no-store" } });
    }
    return renderRef(request, kernel, "forbidden", 403, "Forbidden");
}

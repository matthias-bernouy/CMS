import type { PageCapabilityRequirement, TPage } from "@bernouy/cms-content/rendering";
import type { GatewayActor } from "@bernouy/cms-gateway";
import { pageRequiresCapabilityExecution } from "@bernouy/cms-gateway/execution";
import type KernelCms from "cms-kernel/KernelCms";
import { renderRef } from "cms-kernel/core/pages/renderRef";

export type PageAccess = "public" | "authenticated" | "admin";
export type PageAccessDecision = { readonly access: PageAccess; readonly response?: Response };

/** Derives Page access from every direct and transitively used capability. */
export async function preflightPageGatewayAccess(
    request: Request,
    page: TPage,
    kernel: KernelCms,
    declaredRequirements?: readonly PageCapabilityRequirement[],
): Promise<PageAccessDecision> {
    const execution = kernel.pageExecution;
    if (!execution) {
        if (!pageRequiresCapabilityExecution({ page, requirements: declaredRequirements ?? [] })) {
            return { access: "public" };
        }
        return {
            access: "public",
            response: new Response("Service unavailable", {
                status: 503,
                headers: { "cache-control": "no-store" },
            }),
        };
    }
    const required = await execution
        .requiredAccess(
            { page, requirements: declaredRequirements ?? [] },
            new URL(request.url),
            `${kernel.cmsPathPrefix}/call/`,
        )
        .catch(() => null);
    if (!required) {
        return {
            access: "public",
            response: new Response("Service unavailable", {
                status: 503,
                headers: { "cache-control": "no-store" },
            }),
        };
    }
    if (required === "public") {
        return { access: required };
    }
    const actor = await kernelActor(kernel, request);
    if (required === "authenticated" && actor.kind === "anonymous") {
        return { access: required, response: await accessDenied(request, kernel, 401) };
    }
    if (required === "admin" && actor.kind !== "administrator") {
        return {
            access: required,
            response: await accessDenied(request, kernel, actor.kind === "anonymous" ? 401 : 403),
        };
    }
    return { access: required };
}

async function kernelActor(kernel: KernelCms, request: Request): Promise<GatewayActor> {
    const subject = await kernel.authentication.getSubject(request).catch(() => null);
    if (!subject) {
        return { kind: "anonymous" };
    }
    const administrator = await kernel.capabilityGateway?.isAdministrator(subject).catch(() => false);
    return { kind: administrator ? "administrator" : "user", subjectId: subject.identifier };
}

async function accessDenied(request: Request, kernel: KernelCms, status: 401 | 403): Promise<Response> {
    if (status === 401) {
        const url = new URL(request.url);
        const returnTo = `${url.pathname}${url.search}`;
        const settings = await kernel.repository.getRenderingSettings().catch(() => null);
        const loginRef = settings?.site.login;
        const loginPage = loginRef ? await kernel.repository.getPublishedPageById(loginRef.pageId) : null;
        const loginPath = loginPage?.path;
        if (loginPath === url.pathname) {
            return new Response("Unauthorized", { status });
        }
        const location = loginPath
            ? `${loginPath}?returnTo=${encodeURIComponent(returnTo)}`
            : kernel.authentication.buildLoginUrl(returnTo);
        return new Response(null, { status: 302, headers: { Location: location } });
    }
    return renderRef(request, kernel, "forbidden", 403, "Forbidden");
}

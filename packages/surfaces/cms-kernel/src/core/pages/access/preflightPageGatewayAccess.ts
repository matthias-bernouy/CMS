import type { TPage } from "@bernouy/cms-content/rendering";
import type { CollectionCapabilityRequirement } from "@bernouy/cms-repository/collections";
import type { GatewayActor } from "@bernouy/cms-gateway";
import type KernelCms from "cms-kernel/KernelCms";
import { resolvePageCapabilityRequirements } from "cms-kernel/core/pages/access/pageCapabilityRequirements";
import { renderRef } from "cms-kernel/core/pages/renderRef";

export type PageAccess = "public" | "authenticated" | "admin";
export type PageAccessDecision = { readonly access: PageAccess; readonly response?: Response };

/** Derives Page access from every direct and transitively used capability. */
export async function preflightPageGatewayAccess(
    request: Request,
    page: TPage,
    kernel: KernelCms,
    declaredRequirements?: readonly CollectionCapabilityRequirement[],
): Promise<PageAccessDecision> {
    const requirements = await resolvePageCapabilityRequirements(
        page.content,
        kernel,
        new URL(request.url),
        declaredRequirements,
    );
    const gateway = kernel.capabilityGateway;
    if (!requirements || (requirements.length > 0 && !gateway?.resolveCapabilityAccess)) {
        return {
            access: "public",
            response: new Response("Service unavailable", {
                status: 503,
                headers: { "cache-control": "no-store" },
            }),
        };
    }
    const resolveCapabilityAccess = gateway?.resolveCapabilityAccess;
    if (!resolveCapabilityAccess) {
        return { access: "public" };
    }
    let required: "public" | "authenticated" | "admin" = "public";
    for (const target of requirements) {
        const access = await resolveCapabilityAccess(target.contractId, target.capabilityId).catch(() => null);
        if (!access) {
            return {
                access: "public",
                response: new Response("Service unavailable", {
                    status: 503,
                    headers: { "cache-control": "no-store" },
                }),
            };
        }
        if (access === "admin") {
            required = "admin";
        } else if (access === "authenticated" && required === "public") {
            required = "authenticated";
        }
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

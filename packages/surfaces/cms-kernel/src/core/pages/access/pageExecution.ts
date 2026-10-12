import type { RenderablePage } from "@bernouy/cms-content/rendering";
import { GatewayError } from "@bernouy/cms-gateway";
import type { GatewayExecutionPin } from "@bernouy/cms-gateway/execution";
import type KernelCms from "cms-kernel/KernelCms";
import { resolvePageCapabilityRequirements } from "cms-kernel/core/pages/access/pageCapabilityRequirements";

/** Resolves one browser call to the exact installed Page plan selected by its same-origin referrer. */
export async function authorizePageCall(
    request: Request,
    kernel: KernelCms,
    contractId: string,
    capabilityId: string,
): Promise<GatewayExecutionPin> {
    const authority = kernel.capabilityGateway?.pageExecutions;
    const referred = referringPagePath(request, kernel.runner.basePath);
    const selected = referred ? await kernel.repository.getRenderablePage(referred) : null;
    if (!authority || !selected) {
        throw new GatewayError("not_authorized", "A current Page execution plan is required");
    }
    const consumer = executionConsumer(kernel, selected);
    const requirements = await resolvePageCapabilityRequirements(
        selected.page.content,
        kernel,
        new URL(request.headers.get("referer") ?? request.url),
        selected.requirements,
    );
    if (!requirements) {
        throw new GatewayError("not_selected", "A Page capability route could not be resolved");
    }
    await authority.activate({ consumer, requirements });
    return authority.authorize({ ...consumer, contractId, capabilityId });
}

function executionConsumer(kernel: KernelCms, selected: RenderablePage) {
    const configured = kernel.capabilityGateway!;
    if (selected.source.kind === "site") {
        return {
            kind: "site" as const,
            siteId: configured.siteId,
            pageId: selected.source.pageId,
            pageRevision: selected.source.revision,
        };
    }
    const source = selected.source;
    return {
        kind: "collection" as const,
        siteId: configured.siteId,
        publisherId: source.sourceId,
        collectionId: source.contributionId,
        collectionVersion: source.version,
        collectionDigest: source.digest,
        pageId: source.pageId,
        pageGeneration: source.generation,
    } as const;
}

function referringPagePath(request: Request, basePath: string): string | null {
    const raw = request.headers.get("referer");
    if (!raw) {
        return null;
    }
    try {
        const requestUrl = new URL(request.url);
        const referrer = new URL(raw);
        if (requestUrl.origin !== referrer.origin) {
            return null;
        }
        const base = basePath === "/" ? "" : basePath.replace(/\/$/u, "");
        if (base && referrer.pathname !== base && !referrer.pathname.startsWith(`${base}/`)) {
            return null;
        }
        const local = referrer.pathname.slice(base.length) || "/";
        return local.length > 1 && local.endsWith("/") ? local.slice(0, -1) : local;
    } catch {
        return null;
    }
}

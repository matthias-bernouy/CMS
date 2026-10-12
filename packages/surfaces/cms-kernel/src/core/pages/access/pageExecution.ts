import { pageRequirements } from "@bernouy/cms-repository/collections";
import { GatewayError } from "@bernouy/cms-gateway";
import type { GatewayExecutionPin } from "@bernouy/cms-gateway/execution";
import type KernelCms from "cms-kernel/KernelCms";
import { resolvePageCapabilityRequirements } from "cms-kernel/core/pages/access/pageCapabilityRequirements";
import { findPage, pageSnapshot, type InstalledPage } from "cms-kernel/core/pages/pageRegistry";

/** Resolves one browser call to the exact installed Page plan selected by its same-origin referrer. */
export async function authorizePageCall(
    request: Request,
    kernel: KernelCms,
    contractId: string,
    capabilityId: string,
): Promise<GatewayExecutionPin> {
    const authority = kernel.capabilityGateway?.pageExecutions;
    const referred = referringPagePath(request, kernel.runner.basePath);
    const snapshot = await pageSnapshot(kernel.state);
    const selected = referred && snapshot ? findPage(snapshot, referred) : null;
    if (!authority || !snapshot || !selected) {
        throw new GatewayError("not_authorized", "A current Page execution plan is required");
    }
    const releases = snapshot.collections.map(({ release }) => release);
    const consumer = executionConsumer(kernel, selected);
    const declared = selected.kind === "collection" ? pageRequirements(releases, selected.page) : undefined;
    const content = selected.kind === "collection" ? selected.page.document.html : selected.page.content;
    const requirements = await resolvePageCapabilityRequirements(
        content,
        kernel,
        new URL(request.headers.get("referer") ?? request.url),
        declared,
    );
    if (!requirements) {
        throw new GatewayError("not_selected", "A Page capability route could not be resolved");
    }
    await authority.activate({ consumer, requirements });
    return authority.authorize({ ...consumer, contractId, capabilityId });
}

function executionConsumer(kernel: KernelCms, selected: InstalledPage) {
    const configured = kernel.capabilityGateway!;
    if (selected.kind === "site") {
        return {
            kind: "site" as const,
            siteId: configured.siteId,
            pageId: selected.page.id,
            pageRevision: selected.page.revision,
        };
    }
    const { installation, page } = selected;
    return {
        kind: "collection" as const,
        siteId: configured.siteId,
        publisherId: installation.release.publisherId,
        collectionId: installation.collectionId,
        collectionVersion: installation.release.version,
        collectionDigest: installation.digest,
        pageId: page.id,
        pageGeneration: page.generation ?? 1,
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

import { pageRequirements } from "@bernouy/cms-repository/collections";
import { GatewayError } from "@bernouy/cms-gateway";
import type { GatewayExecutionPin } from "@bernouy/cms-gateway/execution";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import { controlPagePath } from "./paths";
import { controlPageSnapshot, findControlPage, type InstalledControlPage } from "./registry";

/** Resolves one browser call to the exact installed Page plan selected by its same-origin referrer. */
export async function authorizeControlPageCall(
    request: Request,
    state: ControlCmsState,
    contractId: string,
    capabilityId: string,
): Promise<GatewayExecutionPin> {
    const authority = state.configuration.capabilityGateway?.pageExecutions;
    const referred = referringPagePath(request, state.runner.basePath);
    const snapshot = await controlPageSnapshot(state);
    const selected = referred && snapshot ? findControlPage(snapshot, referred) : null;
    if (!authority || !snapshot || !selected) {
        throw new GatewayError("not_authorized", "A current collection Page execution plan is required");
    }
    const releases = snapshot.collections.map(({ release }) => release);
    const consumer = executionConsumer(state, selected);
    await authority.activate({
        consumer,
        requirements: pageRequirements(releases, selected.page),
    });
    return authority.authorize({ ...consumer, contractId, capabilityId });
}

function executionConsumer(state: ControlCmsState, selected: InstalledControlPage) {
    const configured = state.configuration.capabilityGateway!;
    const { installation, page } = selected;
    return {
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
        return controlPagePath(referrer.pathname, basePath);
    } catch {
        return null;
    }
}

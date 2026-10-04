import { viewRequirements } from "@bernouy/cms-repository/collections";
import type { DashboardNavigationItem } from "@bernouy/cms-dashboards";
import type { ControlCms } from "cms-control/ControlCms";

/** Compile site grants for every capability-bearing view before a dashboard becomes reachable. */
export async function activateDashboardViewExecutions(
    cms: ControlCms,
    navigation: readonly DashboardNavigationItem[],
): Promise<void> {
    const collections = cms.config.collections;
    const authority = cms.config.capabilityGateway?.viewExecutions;
    if (!collections) {
        throw new Error("Collection runtime is unavailable");
    }
    const snapshot = await collections.store.snapshot(collections.siteId);
    const releases = snapshot.collections.map(({ release }) => release);
    for (const use of new Set(collectUses(navigation))) {
        const [collectionId, viewId] = use.split(":");
        const installation = snapshot.collections.find((item) => item.collectionId === collectionId);
        const view = installation?.release.views?.find((item) => item.id === viewId);
        if (!installation || !view) {
            throw new Error(`Dashboard view ${use} is no longer installed`);
        }
        const requirements = viewRequirements(releases, view);
        if (!requirements.length) {
            continue;
        }
        if (!authority) {
            throw new Error(`Execution planning is unavailable for ${use}`);
        }
        await authority.activate({
            consumer: {
                siteId: collections.siteId,
                publisherId: installation.release.publisherId,
                collectionId: installation.collectionId,
                collectionVersion: installation.release.version,
                collectionDigest: installation.digest,
                viewId: view.id,
                viewGeneration: view.generation ?? 1,
            },
            requirements,
        });
    }
}

function collectUses(items: readonly DashboardNavigationItem[]): string[] {
    return items.flatMap((item) => [...(item.use ? [item.use] : []), ...collectUses(item.children ?? [])]);
}

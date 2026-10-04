import { dashboardNavigationViews, type DashboardRecord, type DashboardRepository } from "@bernouy/cms-dashboards";
import type { CollectionMigrationParticipant } from "@bernouy/cms-content/migrations";
import type { CollectionViewExecutionAuthority } from "@bernouy/cms-gateway/execution";
import { viewRequirements } from "@bernouy/cms-repository/collections";
import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";

export function createDashboardMigrationParticipant(
    dashboards: DashboardRepository,
    executions?: CollectionViewExecutionAuthority,
): CollectionMigrationParticipant {
    return {
        id: "cms-dashboards",
        async collectReferences(siteId) {
            const records = (await dashboards.list(siteId))
                .filter(({ origin }) => !origin)
                .sort((left, right) => left.id.localeCompare(right.id));
            return records.flatMap((record) =>
                dashboardNavigationViews(record.navigation).map(({ use }) => {
                    const separator = use.indexOf(":");
                    return {
                        kind: "view" as const,
                        collectionId: separator < 0 ? use : use.slice(0, separator),
                        id: separator < 0 ? "" : use.slice(separator + 1),
                        location: `Dashboard ${record.name}`,
                    };
                }),
            );
        },
        async prepareTarget({ siteId, collections }) {
            const releases = collections.map(({ release }) => release);
            const records = (await dashboards.list(siteId)).filter(({ enabled }) => enabled);
            for (const use of new Set(records.flatMap((record) => dashboardUses(record, collections)))) {
                const separator = use.indexOf(":");
                const collectionId = separator < 0 ? use : use.slice(0, separator);
                const viewId = separator < 0 ? "" : use.slice(separator + 1);
                const installation = collections.find((item) => item.collectionId === collectionId);
                const view = installation?.release.views?.find(({ id }) => id === viewId);
                if (!installation || !view) {
                    throw new Error(`Enabled dashboard view ${use} is unavailable in the migration target`);
                }
                const requirements = viewRequirements(releases, view);
                if (!requirements.length) {
                    continue;
                }
                if (!executions) {
                    throw new Error(`Execution planning is unavailable for enabled dashboard view ${use}`);
                }
                await executions.activate({
                    consumer: {
                        siteId,
                        publisherId: installation.release.publisherId,
                        collectionId,
                        collectionVersion: installation.release.version,
                        collectionDigest: installation.digest,
                        viewId,
                        viewGeneration: view.generation ?? 1,
                    },
                    requirements,
                });
            }
        },
    };
}

function dashboardUses(record: DashboardRecord, collections: readonly InstalledCollection[]): string[] {
    if (!record.origin) {
        return dashboardNavigationViews(record.navigation).map(({ use }) => use);
    }
    const installation = collections.find(
        ({ collectionId, release }) =>
            collectionId === record.origin?.collectionId && release.publisherId === record.origin.publisherId,
    );
    const definition = installation?.release.dashboards?.find(({ id }) => id === record.origin?.dashboardId);
    if (!installation || !definition) {
        throw new Error(`Enabled collection dashboard ${record.id} is unavailable in the migration target`);
    }
    return dashboardNavigationViews(definition.navigation).map(({ use }) => `${installation.collectionId}:${use}`);
}

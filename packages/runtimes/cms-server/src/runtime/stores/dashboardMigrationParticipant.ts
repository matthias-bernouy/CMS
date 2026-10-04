import { dashboardNavigationViews, type DashboardRepository } from "@bernouy/cms-dashboards";
import type { CollectionMigrationParticipant } from "@bernouy/cms-content/migrations";

export function createDashboardMigrationParticipant(dashboards: DashboardRepository): CollectionMigrationParticipant {
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
    };
}

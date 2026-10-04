import { dashboardNavigationViews, type DashboardRepository } from "@bernouy/cms-dashboards";
import type { CollectionMigrationReferenceSource } from "@bernouy/cms-content/migrations";
import { createHash } from "node:crypto";

export function createDashboardMigrationReferences(
    dashboards: DashboardRepository,
): CollectionMigrationReferenceSource {
    return {
        id: "cms-dashboards",
        async snapshot(siteId) {
            const records = (await dashboards.list(siteId))
                .filter(({ origin }) => !origin)
                .sort((left, right) => left.id.localeCompare(right.id));
            const references = records.flatMap((record) =>
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
            return {
                digest: `sha256:${createHash("sha256").update(JSON.stringify(records)).digest("hex")}`,
                references,
            };
        },
    };
}

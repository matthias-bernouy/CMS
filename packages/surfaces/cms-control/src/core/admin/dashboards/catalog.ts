import { createHash } from "node:crypto";
import type { DashboardNavigationItem, DashboardRecord } from "@bernouy/cms-dashboards";
import type { CollectionDashboardNavigationItem } from "@bernouy/cms-repository/collections";
import type { ControlCms } from "cms-control/ControlCms";
import { dashboardCollections } from "./access";

/** Merge immutable collection definitions with site-owned activation records. */
export async function dashboardCatalog(cms: ControlCms): Promise<DashboardRecord[]> {
    const { siteId, store } = dashboardCollections(cms);
    const [stored, snapshot] = await Promise.all([cms.dashboards.list(siteId), store.snapshot(siteId)]);
    const overrides = new Map(stored.map((item) => [item.id, item]));
    const siteDashboards = stored.filter((item) => !item.origin);
    const collectionDashboards = snapshot.collections.flatMap((installation) =>
        (installation.release.dashboards ?? []).map((definition) => {
            const id = collectionDashboardId(
                siteId,
                installation.release.publisherId,
                installation.collectionId,
                definition.id,
            );
            const state = overrides.get(id);
            return {
                id,
                siteId,
                name: definition.name,
                description: definition.description,
                enabled: state?.enabled ?? false,
                revision: state?.revision ?? 0,
                navigation: definition.navigation
                    ? definition.navigation.map((item) => bindCollectionNavigation(item, installation.collectionId))
                    : (definition.views ?? []).map((view, index) => ({
                          id: `view-${index + 1}`,
                          label: view.label,
                          use: `${installation.collectionId}:${view.viewId}`,
                      })),
                sourceContracts: definition.contracts ?? [],
                origin: {
                    kind: "collection" as const,
                    publisherId: installation.release.publisherId,
                    collectionId: installation.collectionId,
                    dashboardId: definition.id,
                },
                collectionName: installation.release.name,
            };
        }),
    );
    return [...siteDashboards, ...collectionDashboards];
}

function bindCollectionNavigation(
    item: CollectionDashboardNavigationItem,
    collectionId: string,
): DashboardNavigationItem {
    return {
        id: item.id,
        label: item.label,
        ...(item.icon ? { icon: item.icon } : {}),
        ...(item.use ? { use: `${collectionId}:${item.use}` } : {}),
        ...(item.children
            ? {
                  childPlacement: item.childPlacement,
                  children: item.children.map((child) => bindCollectionNavigation(child, collectionId)),
              }
            : {}),
    };
}

export async function dashboardFromCatalog(cms: ControlCms, id: string): Promise<DashboardRecord | null> {
    return (await dashboardCatalog(cms)).find((item) => item.id === id) ?? null;
}

function collectionDashboardId(siteId: string, publisherId: string, collectionId: string, dashboardId: string): string {
    const digest = createHash("sha256")
        .update(JSON.stringify([siteId, publisherId, collectionId, dashboardId]))
        .digest("hex")
        .slice(0, 32);
    return `collection-${digest}`;
}

import { createHash } from "node:crypto";
import type { DashboardNavigationItem, DashboardRecord } from "@bernouy/cms-dashboards";
import type { CollectionDashboardNavigationItem } from "@bernouy/cms-repository/collections";
import { resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import type { ControlCms } from "cms-control/ControlCms";
import { dashboardCollections } from "./access";
import { collectionViewRequirements } from "@bernouy/cms-repository/collections";

/** Site dashboard plus capabilities derived from its selected collection views. */
export type DashboardCatalogRecord = DashboardRecord & { readonly sourceContracts: readonly string[] };

/** Merge immutable collection definitions with site-owned activation records. */
export async function dashboardCatalog(cms: ControlCms, locale?: string): Promise<DashboardCatalogRecord[]> {
    const { siteId, store } = dashboardCollections(cms);
    const [stored, snapshot] = await Promise.all([cms.dashboards.list(siteId), store.snapshot(siteId)]);
    const overrides = new Map(stored.map((item) => [item.id, item]));
    const releases = snapshot.collections.map(({ release }) => release);
    const siteDashboards = stored
        .filter((item) => !item.origin)
        .map((item) => {
            const { sourceContracts: _legacy, ...dashboard } = item as DashboardRecord & {
                sourceContracts?: readonly string[];
            };
            return {
                ...dashboard,
                sourceContracts: dashboardSourceContracts(item.navigation, releases),
            };
        });
    const collectionDashboards = snapshot.collections.flatMap((installation) => {
        const viewIcons = new Map((installation.release.views ?? []).map((view) => [view.id, view.icon ?? "layout"]));
        return (installation.release.dashboards ?? []).map((definition) => {
            const translate = (key: string) => resolveCollectionTranslation(installation.release, key, locale);
            const id = collectionDashboardId(
                siteId,
                installation.release.publisherId,
                installation.collectionId,
                definition.id,
            );
            const state = overrides.get(id);
            const navigation = definition.navigation.map((item) =>
                bindCollectionNavigation(item, installation.collectionId, viewIcons, translate),
            );
            return {
                id,
                siteId,
                name: translate(definition.name),
                icon: definition.icon ?? "layout",
                description: definition.description ? translate(definition.description) : undefined,
                enabled: state?.enabled ?? false,
                revision: state?.revision ?? 0,
                navigation,
                sourceContracts: dashboardSourceContracts(navigation, releases),
                origin: {
                    kind: "collection" as const,
                    publisherId: installation.release.publisherId,
                    collectionId: installation.collectionId,
                    dashboardId: definition.id,
                },
                collectionName: translate(installation.release.name),
            };
        });
    });
    return [...siteDashboards, ...collectionDashboards];
}

function dashboardSourceContracts(
    navigation: readonly DashboardNavigationItem[],
    releases: Parameters<typeof collectionViewRequirements>[0],
): string[] {
    const contracts = new Set<string>();
    collectNavigationUses(navigation).forEach((use) => {
        const [collectionId, viewId] = use.split(":");
        if (!collectionId || !viewId) {
            return;
        }
        collectionViewRequirements(releases, collectionId, viewId).forEach((requirement) =>
            contracts.add(requirement.contractId),
        );
    });
    return [...contracts].sort();
}

function collectNavigationUses(items: readonly DashboardNavigationItem[]): string[] {
    return items.flatMap((item) => [...(item.use ? [item.use] : []), ...collectNavigationUses(item.children ?? [])]);
}

function bindCollectionNavigation(
    item: CollectionDashboardNavigationItem,
    collectionId: string,
    viewIcons: ReadonlyMap<string, string>,
    translate: (key: string) => string,
): DashboardNavigationItem {
    return {
        id: item.id,
        label: translate(item.label),
        ...(item.icon ? { icon: item.icon } : item.use ? { icon: viewIcons.get(item.use) ?? "layout" } : {}),
        ...(item.use ? { use: `${collectionId}:${item.use}` } : {}),
        ...(item.children
            ? {
                  childPlacement: item.childPlacement,
                  children: item.children.map((child) =>
                      bindCollectionNavigation(child, collectionId, viewIcons, translate),
                  ),
              }
            : {}),
    };
}

export async function dashboardFromCatalog(
    cms: ControlCms,
    id: string,
    locale?: string,
): Promise<DashboardCatalogRecord | null> {
    return (await dashboardCatalog(cms, locale)).find((item) => item.id === id) ?? null;
}

function collectionDashboardId(siteId: string, publisherId: string, collectionId: string, dashboardId: string): string {
    const digest = createHash("sha256")
        .update(JSON.stringify([siteId, publisherId, collectionId, dashboardId]))
        .digest("hex")
        .slice(0, 32);
    return `collection-${digest}`;
}

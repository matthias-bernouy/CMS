import { type PageReference, type SurfacePageRoute, type TPage } from "@bernouy/cms-content";
import type { CollectionPage } from "@bernouy/cms-repository/collections";
import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

interface InstalledCollectionControlPage {
    readonly kind: "collection";
    readonly installation: InstalledCollection;
    readonly page: CollectionPage;
    readonly route: SurfacePageRoute;
}

interface InstalledSiteControlPage {
    readonly kind: "site";
    readonly page: TPage;
    readonly route: SurfacePageRoute;
}

export type InstalledControlPage = InstalledCollectionControlPage | InstalledSiteControlPage;

export interface ControlPageSnapshot {
    readonly revision: number;
    readonly collections: readonly InstalledCollection[];
    readonly pages: readonly InstalledControlPage[];
}

/** Reads the immutable collection snapshot and its precomputed site-owned routes. */
export async function controlPageSnapshot(state: ControlCmsState): Promise<ControlPageSnapshot | null> {
    const configured = state.configuration.collections;
    if (!configured?.routes) {
        return null;
    }
    const snapshot = await configured.store.snapshot(configured.siteId);
    const routes = await configured.routes.list(configured.siteId);
    const routesByPage = new Map(routes.map((route) => [pageReferenceKey(route.page), route]));
    const pages: InstalledControlPage[] = [];
    for (const installation of snapshot.collections) {
        for (const page of installation.release.pages ?? []) {
            if (page.surface !== "control") {
                continue;
            }
            const reference = collectionPageReference(installation, page);
            const route = routesByPage.get(pageReferenceKey(reference));
            if (!route) {
                throw new Error("Collection Page routes are not synchronized");
            }
            if (route.surface !== page.surface) {
                throw new Error("Stored collection Page route changed surface");
            }
            pages.push({ kind: "collection", installation, page, route });
        }
    }
    for (const page of await state.repository.getAllPages()) {
        if (page.surface !== "control") {
            continue;
        }
        const reference = { kind: "site" as const, pageId: page.id };
        const route = routesByPage.get(pageReferenceKey(reference));
        if (!route || route.surface !== "control") {
            throw new Error("Site Page routes are not synchronized");
        }
        pages.push({ kind: "site", page, route });
    }
    pages.sort((left, right) => left.route.path.localeCompare(right.route.path));
    return { revision: snapshot.revision, collections: snapshot.collections, pages };
}

export function findControlPage(snapshot: ControlPageSnapshot, path: string): InstalledControlPage | null {
    return snapshot.pages.find(({ route }) => route.path === path) ?? null;
}

export function collectionPageReference(
    installation: InstalledCollection,
    page: CollectionPage,
): Extract<PageReference, { kind: "contribution" }> {
    return {
        kind: "contribution",
        sourceId: installation.release.publisherId,
        contributionId: installation.collectionId,
        pageId: page.id,
    };
}

function pageReferenceKey(page: PageReference): string {
    return page.kind === "site"
        ? `site:${page.pageId}`
        : `contribution:${page.sourceId}:${page.contributionId}:${page.pageId}`;
}

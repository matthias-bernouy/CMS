import { type PageReference, type SurfacePageRoute } from "@bernouy/cms-content";
import type { CollectionPage } from "@bernouy/cms-repository/collections";
import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import type { ControlCmsState } from "cms-control/core/admin/control/types";

export interface InstalledControlPage {
    readonly installation: InstalledCollection;
    readonly page: CollectionPage;
    readonly route: SurfacePageRoute;
}

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
    const routes = await configured.routes.list();
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
            pages.push({ installation, page, route });
        }
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
): Extract<PageReference, { kind: "collection" }> {
    return {
        kind: "collection",
        publisherId: installation.release.publisherId,
        collectionId: installation.collectionId,
        pageId: page.id,
    };
}

function pageReferenceKey(page: PageReference): string {
    return page.kind === "site"
        ? `site:${page.pageId}`
        : `collection:${page.publisherId}:${page.collectionId}:${page.pageId}`;
}

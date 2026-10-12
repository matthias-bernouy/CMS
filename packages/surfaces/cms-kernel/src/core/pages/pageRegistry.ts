import { type PageReference, type RegisteredPageRoute, type TPage } from "@bernouy/cms-content/kernel";
import type { CollectionPage } from "@bernouy/cms-repository/collections";
import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import type { KernelCmsState } from "cms-kernel/core/admin/runtime/types";

interface InstalledCollectionPage {
    readonly kind: "collection";
    readonly installation: InstalledCollection;
    readonly page: CollectionPage;
    readonly route: RegisteredPageRoute;
}

interface InstalledSitePage {
    readonly kind: "site";
    readonly page: TPage;
    readonly route: RegisteredPageRoute;
}

export type InstalledPage = InstalledCollectionPage | InstalledSitePage;

export interface PageSnapshot {
    readonly revision: number;
    readonly collections: readonly InstalledCollection[];
    readonly pages: readonly InstalledPage[];
}

/** Reads every installed collection Page and site-owned Page from the shared route registry. */
export async function pageSnapshot(state: KernelCmsState): Promise<PageSnapshot | null> {
    const configured = state.configuration.collections;
    if (!configured?.routes) {
        return null;
    }
    const snapshot = await configured.store.snapshot(configured.siteId);
    const routes = await configured.routes.list(configured.siteId);
    const routesByPage = new Map(routes.map((route) => [pageReferenceKey(route.page), route]));
    const pages: InstalledPage[] = [];
    for (const installation of snapshot.collections) {
        for (const page of installation.release.pages ?? []) {
            const reference = collectionPageReference(installation, page);
            const route = routesByPage.get(pageReferenceKey(reference));
            if (!route) {
                throw new Error("Collection Page routes are not synchronized");
            }
            pages.push({ kind: "collection", installation, page, route });
        }
    }
    for (const page of await state.repository.getAllPages()) {
        const reference = { kind: "site" as const, pageId: page.id };
        const route = routesByPage.get(pageReferenceKey(reference));
        if (!route) {
            throw new Error("Site Page routes are not synchronized");
        }
        pages.push({ kind: "site", page, route });
    }
    pages.sort((left, right) => left.route.path.localeCompare(right.route.path));
    return { revision: snapshot.revision, collections: snapshot.collections, pages };
}

export function findPage(snapshot: PageSnapshot, path: string): InstalledPage | null {
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

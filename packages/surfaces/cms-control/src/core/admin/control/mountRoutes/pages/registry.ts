import {
    PageRouteAlreadyRegisteredError,
    PageRouteRevisionConflictError,
    type PageReference,
    type SurfacePageRoute,
    type SurfacePageRouteRegistry,
} from "@bernouy/cms-content";
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

/** Reconciles immutable collection Page identities with site-owned route overrides. */
export async function controlPageSnapshot(state: ControlCmsState): Promise<ControlPageSnapshot | null> {
    const configured = state.configuration.collections;
    if (!configured?.routes) {
        return null;
    }
    const snapshot = await configured.store.snapshot(configured.siteId);
    const pages: InstalledControlPage[] = [];
    for (const installation of snapshot.collections) {
        for (const page of installation.release.pages ?? []) {
            if (page.surface !== "control") {
                continue;
            }
            const reference = collectionPageReference(installation, page);
            const route = await reconcileRoute(configured.routes, reference, page.defaultPath);
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

async function reconcileRoute(
    routes: SurfacePageRouteRegistry,
    page: PageReference,
    defaultPath: string,
): Promise<SurfacePageRoute> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await routes.get(page);
        if (!current) {
            try {
                return await routes.register({ page, surface: "control", defaultPath });
            } catch (error) {
                if (!(error instanceof PageRouteAlreadyRegisteredError)) {
                    throw error;
                }
                continue;
            }
        }
        if (current.defaultPath === defaultPath) {
            return current;
        }
        try {
            return await routes.updateDefault(page, defaultPath, current.revision);
        } catch (error) {
            if (!(error instanceof PageRouteRevisionConflictError)) {
                throw error;
            }
        }
    }
    throw new Error("Collection Page route changed during reconciliation");
}

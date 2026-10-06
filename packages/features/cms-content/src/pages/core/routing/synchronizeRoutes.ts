import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import type { TPage } from "cms-content/pages/interfaces/pages";
import type {
    PageReference,
    SurfacePageRoute,
    SurfacePageRouteRegistration,
    SurfacePageRouteRegistry,
} from "cms-content/pages/interfaces/routing";
import { pageReferenceKey, validateSurfacePagePath } from "cms-content/pages/core/routing/values";

type CollectionSnapshot = { readonly collections: readonly InstalledCollection[] };

/** Rebuilds the complete site route projection from both canonical Page sources. */
export async function synchronizePageRoutes(
    routes: SurfacePageRouteRegistry,
    siteId: string,
    collections: CollectionSnapshot,
    sitePages: readonly TPage[],
): Promise<void> {
    const desired = [...collectionRegistrations(collections.collections), ...siteRegistrations(sitePages)];
    await synchronizePageRouteRegistrations(routes, siteId, desired, () => true);
}

/** Reconciles one owned subset while treating every other route as fixed. */
export async function synchronizePageRouteRegistrations(
    routes: SurfacePageRouteRegistry,
    siteId: string,
    desired: readonly SurfacePageRouteRegistration[],
    owns: (route: SurfacePageRoute) => boolean,
): Promise<void> {
    const existing = await routes.list(siteId);
    const desiredKeys = new Set(desired.map(({ page }) => pageReferenceKey(page)));
    const existingByPage = new Map(existing.map((route) => [pageReferenceKey(route.page), route]));
    assertDesiredRoutes(existing, existingByPage, desired, owns);

    const orphaned = existing.filter((route) => owns(route) && !desiredKeys.has(pageReferenceKey(route.page)));
    const moved = desired.filter((registration) => {
        const current = existingByPage.get(pageReferenceKey(registration.page));
        return current && !current.overridePath && current.defaultPath !== registration.defaultPath;
    });
    await Promise.all(
        [...orphaned, ...moved.map(({ page }) => existingByPage.get(pageReferenceKey(page))!)].map((route) =>
            routes.remove(siteId, route.page, route.revision),
        ),
    );

    const recreated = new Set(moved.map(({ page }) => pageReferenceKey(page)));
    for (const registration of desired) {
        const key = pageReferenceKey(registration.page);
        const current = recreated.has(key) ? undefined : existingByPage.get(key);
        if (!current) {
            await routes.register(siteId, registration);
        } else if (current.defaultPath !== registration.defaultPath) {
            await routes.updateDefault(siteId, registration.page, registration.defaultPath, current.revision);
        }
    }
}

function collectionRegistrations(collections: readonly InstalledCollection[]): readonly SurfacePageRouteRegistration[] {
    return collections.flatMap((installation) =>
        (installation.release.pages ?? []).map((page) => ({
            page: {
                kind: "collection" as const,
                publisherId: installation.release.publisherId,
                collectionId: installation.collectionId,
                pageId: page.id,
            },
            surface: page.surface,
            defaultPath: page.defaultPath,
        })),
    );
}

function siteRegistrations(pages: readonly TPage[]): readonly SurfacePageRouteRegistration[] {
    return pages.map((page) => ({
        page: { kind: "site" as const, pageId: page.id },
        surface: page.surface,
        defaultPath: page.path,
    }));
}

function assertDesiredRoutes(
    existingRoutes: readonly SurfacePageRoute[],
    existing: ReadonlyMap<string, SurfacePageRoute>,
    desired: readonly SurfacePageRouteRegistration[],
    owns: (route: SurfacePageRoute) => boolean,
): void {
    const occupied = new Map<string, PageReference>();
    for (const route of existingRoutes.filter((candidate) => !owns(candidate))) {
        occupied.set(`${route.surface}:${route.path}`, route.page);
    }
    const owners = new Set<string>();
    for (const registration of desired) {
        const owner = pageReferenceKey(registration.page);
        if (owners.has(owner)) {
            throw new Error("A Page route identity is duplicated");
        }
        owners.add(owner);
        const current = existing.get(owner);
        if (current && current.surface !== registration.surface) {
            throw new Error("A Page route cannot change surface");
        }
        validateSurfacePagePath(registration.surface, registration.defaultPath);
        const path = validateSurfacePagePath(registration.surface, current?.overridePath ?? registration.defaultPath);
        const key = `${registration.surface}:${path}`;
        if (occupied.has(key)) {
            throw Object.assign(new Error(`Page route already belongs to another Page: ${path}`), { status: 409 });
        }
        occupied.set(key, registration.page);
    }
}

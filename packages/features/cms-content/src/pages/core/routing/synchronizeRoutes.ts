import type {
    PageReference,
    PageRouteRegistration,
    PageRouteRegistry,
    RegisteredPageRoute,
} from "cms-content/pages/interfaces/routing";
import { pageReferenceKey, validateRegisteredPagePath } from "cms-content/pages/core/routing/values";

/** Reconciles one owned subset while treating every other route as fixed. */
export async function synchronizePageRouteRegistrations(
    routes: PageRouteRegistry,
    siteId: string,
    desired: readonly PageRouteRegistration[],
    owns: (route: RegisteredPageRoute) => boolean,
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

function assertDesiredRoutes(
    existingRoutes: readonly RegisteredPageRoute[],
    existing: ReadonlyMap<string, RegisteredPageRoute>,
    desired: readonly PageRouteRegistration[],
    owns: (route: RegisteredPageRoute) => boolean,
): void {
    const occupied = new Map<string, PageReference>();
    for (const route of existingRoutes.filter((candidate) => !owns(candidate))) {
        occupied.set(route.path, route.page);
    }
    const owners = new Set<string>();
    for (const registration of desired) {
        const owner = pageReferenceKey(registration.page);
        if (owners.has(owner)) {
            throw new Error("A Page route identity is duplicated");
        }
        owners.add(owner);
        const current = existing.get(owner);
        validateRegisteredPagePath(registration.defaultPath);
        const path = validateRegisteredPagePath(current?.overridePath ?? registration.defaultPath);
        const key = path;
        if (occupied.has(key)) {
            throw Object.assign(new Error(`Page route already belongs to another Page: ${path}`), { status: 409 });
        }
        occupied.set(key, registration.page);
    }
}

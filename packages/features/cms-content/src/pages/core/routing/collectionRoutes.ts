import type { CollectionStore, InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import type { PageReference, SurfacePageRoute, SurfacePageRouteRegistry } from "cms-content/pages/interfaces/routing";

type CollectionSnapshot = { readonly revision: number; readonly collections: readonly InstalledCollection[] };

const ROUTE_MUTATIONS = new Set([
    "install",
    "installMany",
    "upgrade",
    "commitMigration",
    "restoreMigration",
    "uninstall",
]);

/** Keeps collection-owned Page routes synchronized outside request handling. */
export function withCollectionPageRoutes(store: CollectionStore, routes: SurfacePageRouteRegistry): CollectionStore {
    const pending = new Map<string, Promise<void>>();
    return new Proxy(store, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof property !== "string" || typeof value !== "function" || !ROUTE_MUTATIONS.has(property)) {
                return value;
            }
            return (...args: unknown[]) => {
                const siteId = String(args[0]);
                return serialize(pending, siteId, async () => {
                    const result = (await Reflect.apply(value, target, args)) as CollectionSnapshot;
                    await synchronizeCollectionPageRoutes(routes, result);
                    return result;
                });
            };
        },
    });
}

/** Reconciles the complete installed collection snapshot and removes orphaned collection routes. */
export async function synchronizeCollectionPageRoutes(
    routes: SurfacePageRouteRegistry,
    snapshot: CollectionSnapshot,
): Promise<void> {
    const existing = await routes.list();
    const desired = desiredRoutes(snapshot.collections);
    assertFinalPaths(existing, desired);
    const desiredKeys = new Set(desired.map(({ page }) => referenceKey(page)));
    const orphaned = existing.filter(
        (route) => route.page.kind === "collection" && !desiredKeys.has(referenceKey(route.page)),
    );
    await Promise.all(orphaned.map((route) => routes.remove(route.page, route.revision)));

    const currentByPage = new Map(existing.map((route) => [referenceKey(route.page), route]));
    const replacements = desired.filter(({ page, defaultPath }) => {
        const current = currentByPage.get(referenceKey(page));
        return current && !current.overridePath && current.defaultPath !== defaultPath;
    });
    await Promise.all(
        replacements.map(({ page }) => {
            const current = currentByPage.get(referenceKey(page))!;
            return routes.remove(page, current.revision);
        }),
    );

    for (const registration of desired) {
        const current = currentByPage.get(referenceKey(registration.page));
        if (!current || replacements.some(({ page }) => referenceKey(page) === referenceKey(registration.page))) {
            await routes.register(registration);
            continue;
        }
        if (current.surface !== registration.surface) {
            throw new Error("A collection Page route cannot change surface");
        }
        if (current.defaultPath !== registration.defaultPath) {
            await routes.updateDefault(registration.page, registration.defaultPath, current.revision);
        }
    }
}

function desiredRoutes(collections: readonly InstalledCollection[]) {
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

function assertFinalPaths(existing: readonly SurfacePageRoute[], desired: ReturnType<typeof desiredRoutes>): void {
    const currentByPage = new Map(existing.map((route) => [referenceKey(route.page), route]));
    const occupied = new Set(
        existing.filter((route) => route.page.kind === "site").map((route) => `${route.surface}:${route.path}`),
    );
    for (const registration of desired) {
        const current = currentByPage.get(referenceKey(registration.page));
        const path = current?.overridePath ?? registration.defaultPath;
        const key = `${registration.surface}:${path}`;
        if (occupied.has(key)) {
            throw Object.assign(new Error(`Page route already belongs to another Page: ${path}`), { status: 409 });
        }
        occupied.add(key);
    }
}

function referenceKey(page: PageReference): string {
    return page.kind === "site"
        ? `site:${page.pageId}`
        : `collection:${page.publisherId}:${page.collectionId}:${page.pageId}`;
}

async function serialize<T>(pending: Map<string, Promise<void>>, key: string, operation: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
        release = resolve;
    });
    const queued = previous.then(() => next);
    pending.set(key, queued);
    await previous;
    try {
        return await operation();
    } finally {
        release();
        if (pending.get(key) === queued) {
            pending.delete(key);
        }
    }
}

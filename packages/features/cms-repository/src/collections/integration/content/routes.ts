import type { CollectionStore, InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import {
    PageRouteMutationCoordinator,
    synchronizePageRouteRegistrations,
    type SurfacePageRouteRegistry,
    type TPage,
} from "@bernouy/cms-content";
import { validateCollectionMutationPageLinks } from "./routeMutationValidation";

type CollectionSnapshot = { readonly revision: number; readonly collections: readonly InstalledCollection[] };

/** Rebuilds the complete route projection from installed and site-owned Pages. */
export async function synchronizePageRoutes(
    routes: SurfacePageRouteRegistry,
    siteId: string,
    collections: CollectionSnapshot,
    sitePages: readonly TPage[],
): Promise<void> {
    const desired = [
        ...desiredRoutes(collections.collections),
        ...sitePages.map((page) => ({
            page: { kind: "site" as const, pageId: page.id },
            surface: page.surface,
            defaultPath: page.path,
        })),
    ];
    await synchronizePageRouteRegistrations(routes, siteId, desired, () => true);
}

const ROUTE_MUTATIONS = new Set([
    "install",
    "installMany",
    "upgrade",
    "commitMigration",
    "restoreMigration",
    "uninstall",
]);

/** Keeps collection-owned Page routes synchronized outside request handling. */
export function withCollectionPageRoutes(
    store: CollectionStore,
    routes: SurfacePageRouteRegistry,
    options: {
        readonly coordinator?: PageRouteMutationCoordinator;
        readonly getSitePages?: () => Promise<readonly TPage[]>;
    } = {},
): CollectionStore {
    const coordinator = options.coordinator ?? new PageRouteMutationCoordinator();
    return new Proxy(store, {
        get(target, property, receiver) {
            const value = Reflect.get(target, property, receiver);
            if (typeof property !== "string" || typeof value !== "function") {
                return value;
            }
            if (!ROUTE_MUTATIONS.has(property)) {
                return value.bind(target);
            }
            return (...args: unknown[]) => {
                const siteId = String(args[0]);
                return coordinator.run(siteId, async () => {
                    const sitePages = options.getSitePages ? await options.getSitePages() : undefined;
                    if (sitePages) {
                        await synchronizePageRoutes(routes, siteId, await target.snapshot(siteId), sitePages);
                    }
                    if (options.getSitePages) {
                        await validateCollectionMutationPageLinks(
                            target,
                            siteId,
                            property,
                            args,
                            async () => sitePages!,
                        );
                    }
                    const result = (await Reflect.apply(value, target, args)) as CollectionSnapshot;
                    if (sitePages) {
                        await synchronizePageRoutes(routes, siteId, result, await options.getSitePages!());
                    } else {
                        await synchronizeCollectionPageRoutes(routes, siteId, result);
                    }
                    return result;
                });
            };
        },
    });
}

/** Reconciles the complete installed collection snapshot and removes orphaned collection routes. */
export async function synchronizeCollectionPageRoutes(
    routes: SurfacePageRouteRegistry,
    siteId: string,
    snapshot: CollectionSnapshot,
): Promise<void> {
    const desired = desiredRoutes(snapshot.collections);
    await synchronizePageRouteRegistrations(routes, siteId, desired, (route) => route.page.kind === "contribution");
}

function desiredRoutes(collections: readonly InstalledCollection[]) {
    return collections.flatMap((installation) =>
        (installation.release.pages ?? []).map((page) => ({
            page: {
                kind: "contribution" as const,
                sourceId: installation.release.publisherId,
                contributionId: installation.collectionId,
                pageId: page.id,
            },
            surface: page.surface,
            defaultPath: page.defaultPath,
        })),
    );
}

import type { CollectionStore, InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import type { SurfacePageRouteRegistry } from "cms-content/pages/interfaces/routing";
import type { TPage } from "cms-content/pages/interfaces/pages";
import { validateCollectionMutationPageLinks } from "cms-content/pages/core/routing/collectionMutationValidation";
import { PageRouteMutationCoordinator } from "cms-content/pages/core/routing/mutationCoordinator";
import {
    synchronizePageRouteRegistrations,
    synchronizePageRoutes,
} from "cms-content/pages/core/routing/synchronizeRoutes";

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
    await synchronizePageRouteRegistrations(routes, siteId, desired, (route) => route.page.kind === "collection");
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

import {
    type CollectionDashboardNavigationItem,
    resolveCollectionTranslation,
} from "cms-repository/exports/collections/index";
import type { LocalContractReleases } from "../contracts";
import type { LocalCollectionRepository } from "../collections";
import type { LocalProviderReleases } from "../providers";
import type { LocalRepositoryYanks } from "../yanks";

export type ReadCatalogueDependencies = Readonly<{
    collections: LocalCollectionRepository;
    contracts: LocalContractReleases;
    providers: LocalProviderReleases;
    yanks: LocalRepositoryYanks;
}>;

export async function readCatalogue(
    type: string | undefined,
    dependencies: ReadCatalogueDependencies,
): Promise<Response | null> {
    if (type === "collections") {
        const releases = [];
        for (const { release, digest } of await dependencies.collections.list()) {
            if (
                await dependencies.yanks.get("collection", release.publisherId, release.collectionId, release.version)
            ) {
                continue;
            }
            releases.push({
                publisherId: release.publisherId,
                collectionId: release.collectionId,
                version: release.version,
                digest,
                name: resolveCollectionTranslation(release, release.name),
                description: release.description ? resolveCollectionTranslation(release, release.description) : "",
                blocCount: release.blocs.length,
                hasTheme: Boolean(release.theme),
                dashboards: (release.dashboards ?? []).map((dashboard) => ({
                    id: dashboard.id,
                    name: resolveCollectionTranslation(release, dashboard.name),
                    ...(dashboard.icon ? { icon: dashboard.icon } : {}),
                    description: dashboard.description
                        ? resolveCollectionTranslation(release, dashboard.description)
                        : "",
                    viewCount: countDashboardViews(dashboard.navigation),
                })),
            });
        }
        return listResponse(releases);
    }
    if (type === "contracts") {
        const releases = (await (await dependencies.contracts.catalogue()).list())
            .filter((record) => !record.yank)
            .map(({ admission, publishedAt }) => ({
                publisherId: admission.release.publisherId,
                contractId: admission.release.contractId,
                version: admission.release.version,
                digest: admission.digest,
                name: admission.release.name,
                description: admission.release.description ?? "",
                icon: admission.release.catalogue?.icon,
                categories: admission.release.catalogue?.categories,
                publishedAt,
            }));
        return listResponse(releases);
    }
    if (type === "providers") {
        const releases = (await (await dependencies.providers.catalogue()).list())
            .filter((record) => !record.yank)
            .map(({ admission }) => ({
                publisherId: admission.manifest.provenance.publisherId,
                providerId: admission.manifest.providerId,
                version: admission.manifest.version,
                digest: admission.digest,
                name: admission.manifest.name,
                links: admission.manifest.links,
            }));
        return listResponse(releases);
    }
    return null;
}

function countDashboardViews(items: readonly CollectionDashboardNavigationItem[]): number {
    return items.reduce(
        (count, item) => count + Number(Boolean(item.use)) + countDashboardViews(item.children ?? []),
        0,
    );
}

function listResponse(releases: unknown[]): Response {
    return Response.json({ releases }, { headers: { "Cache-Control": "no-store" } });
}

import { resolveCollectionTranslation } from "cms-repository/exports/collections/index";
import type { CollectionDashboardNavigationItem } from "cms-repository/exports/collections/index";
import { LocalCollectionRepository } from "./artifacts/collections";
import { LocalArtifactFiles } from "./artifacts/files";
import { LocalContractReleases } from "./contracts";
import { LocalProviderReleases } from "./providers";
import { LocalRepositoryYanks } from "./yanks";

export type RepositoryCatalogueType = "collections" | "contracts" | "providers";
export type RepositoryCatalogueEntry = Readonly<Record<string, unknown>>;

export interface RepositoryCatalogueReader {
    list(type: RepositoryCatalogueType, refresh?: boolean): Promise<readonly RepositoryCatalogueEntry[]>;
}

type Snapshot = Readonly<Record<RepositoryCatalogueType, readonly RepositoryCatalogueEntry[]>>;

/** Immutable in-process read index. Mutations invalidate it; standalone readers may explicitly refresh. */
export class FilesystemRepositoryCatalogueIndex implements RepositoryCatalogueReader {
    private readonly collections: LocalCollectionRepository;
    private readonly contracts: LocalContractReleases;
    private readonly providers: LocalProviderReleases;
    private readonly yanks: LocalRepositoryYanks;
    private snapshot?: Snapshot;
    private revision = 0;
    private refreshing?: Promise<Snapshot>;

    constructor(root: string) {
        const files = new LocalArtifactFiles(root);
        this.yanks = new LocalRepositoryYanks(root);
        this.collections = new LocalCollectionRepository(root);
        this.contracts = new LocalContractReleases(files, this.yanks);
        this.providers = new LocalProviderReleases(files, this.contracts, this.yanks);
    }

    invalidate(): void {
        this.revision++;
        this.snapshot = undefined;
    }

    async refresh(): Promise<void> {
        await this.load(true);
    }

    async list(type: RepositoryCatalogueType, refresh = false): Promise<readonly RepositoryCatalogueEntry[]> {
        return (await this.load(refresh))[type];
    }

    private async load(refresh: boolean): Promise<Snapshot> {
        if (!refresh && this.snapshot) {
            return this.snapshot;
        }
        if (!refresh && this.refreshing) {
            return this.refreshing;
        }
        const revision = this.revision;
        const pending = this.build();
        this.refreshing = pending;
        try {
            const snapshot = await pending;
            if (revision === this.revision) {
                this.snapshot = snapshot;
                return snapshot;
            }
            return this.load(true);
        } finally {
            if (this.refreshing === pending) {
                this.refreshing = undefined;
            }
        }
    }

    private async build(): Promise<Snapshot> {
        const [collections, contracts, providers] = await Promise.all([
            this.collectionEntries(),
            this.contractEntries(),
            this.providerEntries(),
        ]);
        return Object.freeze({ collections, contracts, providers });
    }

    private async collectionEntries(): Promise<readonly RepositoryCatalogueEntry[]> {
        const entries: RepositoryCatalogueEntry[] = [];
        for (const { release, digest } of await this.collections.listMetadata()) {
            if (await this.yanks.get("collection", release.publisherId, release.collectionId, release.version)) {
                continue;
            }
            entries.push({
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
        return sorted(entries, "collectionId");
    }

    private async contractEntries(): Promise<readonly RepositoryCatalogueEntry[]> {
        const entries = (await (await this.contracts.catalogue()).list())
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
        return sorted(entries, "contractId");
    }

    private async providerEntries(): Promise<readonly RepositoryCatalogueEntry[]> {
        const entries = (await (await this.providers.catalogue()).list())
            .filter((record) => !record.yank)
            .map(({ admission }) => ({
                publisherId: admission.manifest.provenance.publisherId,
                providerId: admission.manifest.providerId,
                version: admission.manifest.version,
                digest: admission.digest,
                name: admission.manifest.name,
                links: admission.manifest.links,
            }));
        return sorted(entries, "providerId");
    }
}

function sorted(entries: RepositoryCatalogueEntry[], idKey: string): readonly RepositoryCatalogueEntry[] {
    return Object.freeze(entries.sort((left, right) => compareOrdinal(key(left, idKey), key(right, idKey))));
}

function key(entry: RepositoryCatalogueEntry, idKey: string): string {
    return `${entry.publisherId}\0${entry[idKey]}\0${entry.version}`;
}

function compareOrdinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function countDashboardViews(items: readonly CollectionDashboardNavigationItem[]): number {
    return items.reduce(
        (count, item) => count + Number(Boolean(item.use)) + countDashboardViews(item.children ?? []),
        0,
    );
}

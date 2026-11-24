import { LocalWorkflowReleases } from "./artifacts/workflows";
import type { CollectionReferenceScope } from "./artifacts/discovery/collectionReferences";
import type { CollectionVerifier } from "repository/collections/sources/verification";
import { LatestCollectionCatalogue } from "./artifacts/discovery/latestCatalogue";
import { RecipeCatalogue } from "./artifacts/discovery/recipes";
import type { RecipeCatalogueInput } from "repository/application/registry/interfaces/inputs";
import {
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
} from "repository/collections/core/validation/browserCapabilities";
import { resolveCollectionTranslation } from "repository/collections/core/texts/translationCatalogue";
import { LocalCollectionRepository } from "./artifacts/collections";
import { LocalArtifactFiles } from "./artifacts/files";
import { LocalContractReleases } from "./contracts";
import { LocalProviderReleases } from "./providers";
import { LocalRepositoryYanks } from "./yanks";
import { compareCatalogueKeys } from "./core/catalogue";

export type RepositoryCatalogueType = "collections" | "contracts" | "providers" | "workflows";
export type RepositoryCatalogueEntry = RepositoryCatalogueMetadata &
    Readonly<{
        publisherId: string;
        version: string;
        digest: string;
        collectionId?: string;
        contractId?: string;
        providerId?: string;
        workflowId?: string;
    }>;
import type { RepositoryCatalogueMetadata } from "repository/application/registry/interfaces/outputs";

export type RepositoryCatalogueReference = Pick<
    RepositoryCatalogueEntry,
    "publisherId" | "version" | "collectionId" | "contractId" | "providerId" | "workflowId"
>;

export interface RepositoryCatalogueReader {
    list(type: RepositoryCatalogueType, refresh?: boolean): Promise<readonly RepositoryCatalogueEntry[]>;
    latestCollectionReferences?(
        channel: "stable" | "beta" | "all",
        refresh?: boolean,
    ): Promise<readonly RepositoryCatalogueReference[]>;
    collectionReleaseReferences?(input: CollectionReferenceScope): Promise<readonly RepositoryCatalogueReference[]>;
}

type Snapshot = Readonly<Record<RepositoryCatalogueType, readonly RepositoryCatalogueEntry[]>>;

/** Immutable in-process read index. Mutations invalidate it; standalone readers may explicitly refresh. */
export class FilesystemRepositoryCatalogueIndex implements RepositoryCatalogueReader {
    private readonly collections: LocalCollectionRepository;
    private readonly contracts: LocalContractReleases;
    private readonly providers: LocalProviderReleases;
    private readonly workflows: LocalWorkflowReleases;
    private readonly latest: LatestCollectionCatalogue;
    private readonly recipes: RecipeCatalogue;
    private readonly yanks: LocalRepositoryYanks;
    private snapshot?: Snapshot;
    private revision = 0;
    private refreshing?: Promise<Snapshot>;

    constructor(root: string, verifier?: CollectionVerifier) {
        const files = new LocalArtifactFiles(root);
        this.yanks = new LocalRepositoryYanks(root);
        this.collections = new LocalCollectionRepository(root, verifier);
        this.latest = new LatestCollectionCatalogue(root, this.yanks);
        this.recipes = new RecipeCatalogue(root, () => this.latest.read("stable"));
        this.contracts = new LocalContractReleases(files, this.yanks);
        this.providers = new LocalProviderReleases(files, this.contracts, this.yanks);
        this.workflows = new LocalWorkflowReleases(files, this.contracts, this.yanks);
    }

    invalidate(): void {
        this.revision++;
        this.latest.invalidate();
        this.recipes.invalidate();
        this.snapshot = undefined;
    }

    latestCollectionReferences(channel: "stable" | "beta" | "all", refresh = false) {
        return this.latest.read(channel, refresh);
    }

    collectionReleaseReferences(input: CollectionReferenceScope) {
        return this.latest.history(input);
    }

    recipePage(input: RecipeCatalogueInput, signal?: AbortSignal) {
        return this.recipes.page(input, signal);
    }

    /** Registry composition explicitly prepares derived data; discovery never repairs missing records. */
    prepareRecipes() {
        return this.recipes.prepare((reference) =>
            this.collections.getMetadata(reference.publisherId, reference.collectionId, reference.version),
        );
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
        const [collections, contracts, providers, workflows] = await Promise.all([
            this.collectionEntries(),
            this.contractEntries(),
            this.providerEntries(),
            this.workflowEntries(),
        ]);
        return Object.freeze({ collections, contracts, providers, workflows });
    }

    private async collectionEntries(): Promise<readonly RepositoryCatalogueEntry[]> {
        const entries: RepositoryCatalogueEntry[] = [];
        for (const { release, digest } of await this.collections.listMetadata()) {
            if (await this.yanks.get("collection", release.publisherId, release.collectionId, release.version)) {
                continue;
            }
            const browser = collectionBrowserRisk(release);
            entries.push({
                publisherId: release.publisherId,
                collectionId: release.collectionId,
                version: release.version,
                digest,
                name: resolveCollectionTranslation(release, release.name),
                description: release.description ? resolveCollectionTranslation(release, release.description) : "",
                blocCount: release.blocs.length,
                hasTheme: Boolean(release.theme),
                browserRisk: browser.level,
                browserRiskDigest: collectionBrowserRiskDigest(browser),
                javaScriptBlocCount: browser.javaScriptBlocs.length,
                frameBlocCount: browser.frameBlocs.length,
                externalFrameOrigins: browser.externalFrameOrigins,
                scriptsWithSameOrigin: browser.scriptsWithSameOrigin,
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

    private async workflowEntries(): Promise<readonly RepositoryCatalogueEntry[]> {
        return sorted(
            (await this.workflows.listMetadata()).map(({ manifest, digest, publishedAt }) => ({
                publisherId: manifest.publisherId,
                workflowId: manifest.workflowId,
                version: manifest.version,
                digest,
                name: manifest.name,
                description: manifest.description ?? "",
                publishedAt,
            })),
            "workflowId",
        );
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

function sorted(
    entries: RepositoryCatalogueEntry[],
    idKey: "collectionId" | "contractId" | "providerId" | "workflowId",
): readonly RepositoryCatalogueEntry[] {
    return Object.freeze(entries.sort((left, right) => compareCatalogueKeys(key(left, idKey), key(right, idKey))));
}

function key(
    entry: RepositoryCatalogueEntry,
    idKey: "collectionId" | "contractId" | "providerId" | "workflowId",
): string {
    return `${entry.publisherId}\0${entry[idKey]}\0${entry.version}`;
}

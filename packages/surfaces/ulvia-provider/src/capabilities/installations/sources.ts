import type {
    CollectionRepositoryEntry,
    CollectionRepositorySource,
} from "@bernouy/cms-repository/collections/sources";
import { compareSemVer } from "@bernouy/cms-repository/contracts/compatibility";
import {
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
    resolveCollectionTranslation,
    type AdmittedCollectionRelease,
} from "@bernouy/cms-repository/collections";
import { ProviderCapabilityDispatchError } from "../../dispatch/registry";
import type { CmsCollectionDependencies } from "../../ports";
import { requiredText } from "./support";

const MAX_CATALOGUE_RELEASES = 1024;

type ReleaseReference = {
    repositoryId: string;
    publisherId: string;
    collectionId: string;
    version: string;
    digest: string;
    approvedBrowserRiskDigest: string;
};

export class CollectionSources {
    private readonly byId: ReadonlyMap<string, CollectionRepositorySource>;
    private readonly admitted = new Map<string, Promise<AdmittedCollectionRelease>>();

    constructor(
        private readonly store: CmsCollectionDependencies["collections"],
        sources: readonly CollectionRepositorySource[],
    ) {
        this.byId = new Map(sources.map((source) => [source.id, source]));
        if (this.byId.size !== sources.length) {
            throw new TypeError("Collection repository source IDs must be unique");
        }
    }

    async catalogue(siteId: string) {
        const [snapshot, listedReleases] = await Promise.all([
            this.store.snapshot(siteId),
            Promise.all([...this.byId.values()].map((source) => source.list())).then((items) => items.flat()),
        ]);
        if (listedReleases.length > MAX_CATALOGUE_RELEASES) {
            throw new ProviderCapabilityDispatchError("CATALOGUE_TOO_LARGE", 422);
        }
        const releases: ReturnType<typeof verifiedCatalogueEntry>[] = [];
        // Admission can hash multi-megabyte bundles; keep catalogue verification bounded.
        for (const listed of listedReleases) {
            const source = this.byId.get(listed.repositoryId);
            if (!source) {
                throw new ProviderCapabilityDispatchError("RELEASE_MISMATCH", 409);
            }
            const artifact = await this.admitListedRelease(source, listed);
            releases.push(verifiedCatalogueEntry(listed.repositoryId, artifact));
        }
        const installed = new Map(snapshot.collections.map((item) => [item.collectionId, item]));
        return {
            revision: snapshot.revision,
            repositories: [...this.byId.keys()],
            releases: releases.map((release) => ({
                ...release,
                action: releaseAction(release, installed.get(release.collectionId)),
            })),
            installed: snapshot.collections.map(({ collectionId, digest, repositoryId, release }) => ({
                collectionId,
                publisherId: release.publisherId,
                version: release.version,
                digest,
                configurable: release.configuration !== undefined,
                ...(repositoryId ? { repositoryId } : {}),
            })),
        };
    }

    async stage(value: unknown): Promise<readonly { digest: string; repositoryId: string }[]> {
        if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        const references = value.map(parseReference);
        const catalogues = new Map<string, Awaited<ReturnType<CollectionRepositorySource["list"]>>>();
        return Promise.all(
            references.map(async (reference) => {
                const source = this.byId.get(reference.repositoryId);
                if (!source) {
                    throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
                }
                let catalogue = catalogues.get(source.id);
                if (!catalogue) {
                    catalogue = await source.list();
                    catalogues.set(source.id, catalogue);
                }
                const listed = catalogue.find((entry) => sameRelease(entry, reference));
                if (!listed) {
                    throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
                }
                const artifact = await this.admitListedRelease(source, listed);
                const actualBrowserRiskDigest = collectionBrowserRiskDigest(collectionBrowserRisk(artifact.release));
                if (actualBrowserRiskDigest !== reference.approvedBrowserRiskDigest) {
                    throw new ProviderCapabilityDispatchError("BROWSER_CAPABILITIES_APPROVAL_REQUIRED", 409);
                }
                const admitted = await this.store.importAdmittedRelease(artifact);
                if (!sameRelease({ ...admitted.release, digest: admitted.digest }, reference)) {
                    throw new ProviderCapabilityDispatchError("RELEASE_MISMATCH", 409);
                }
                return { digest: admitted.digest, repositoryId: source.id };
            }),
        );
    }

    private admitListedRelease(
        source: CollectionRepositorySource,
        listed: CollectionRepositoryEntry,
    ): Promise<AdmittedCollectionRelease> {
        const key = `${source.id}\0${listed.publisherId}\0${listed.collectionId}\0${listed.version}\0${listed.digest}`;
        const existing = this.admitted.get(key);
        if (existing) {
            return existing;
        }
        const pending = this.loadAndAdmit(source, listed);
        this.admitted.set(key, pending);
        pending.catch(() => {
            if (this.admitted.get(key) === pending) {
                this.admitted.delete(key);
            }
        });
        return pending;
    }

    private async loadAndAdmit(
        source: CollectionRepositorySource,
        listed: CollectionRepositoryEntry,
    ): Promise<AdmittedCollectionRelease> {
        const bundle = await source.get(listed);
        const artifact = await this.store.admitRelease(bundle.release, bundle.assets);
        if (!sameRelease({ ...artifact.release, digest: artifact.digest }, listed)) {
            throw new ProviderCapabilityDispatchError("RELEASE_MISMATCH", 409);
        }
        return artifact;
    }
}

function verifiedCatalogueEntry(repositoryId: string, artifact: AdmittedCollectionRelease) {
    const { release, digest } = artifact;
    const browser = collectionBrowserRisk(release);
    return {
        repositoryId,
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
        javaScriptBlocs: browser.javaScriptBlocs,
        frameBlocCount: browser.frameBlocs.length,
        frameBlocs: browser.frameBlocs,
        externalFrameOrigins: browser.externalFrameOrigins,
        scriptsWithSameOrigin: browser.scriptsWithSameOrigin,
    };
}

function releaseAction(
    release: { digest: string; version: string },
    installed:
        | Awaited<ReturnType<CmsCollectionDependencies["collections"]["snapshot"]>>["collections"][number]
        | undefined,
): "install" | "upgrade" | "current" | "older" {
    if (!installed) {
        return "install";
    }
    if (installed.digest === release.digest) {
        return "current";
    }
    return compareSemVer(release.version, installed.release.version) > 0 ? "upgrade" : "older";
}

function parseReference(value: unknown): ReleaseReference {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    const record = value as Record<string, unknown>;
    return {
        repositoryId: requiredText(record.repositoryId),
        publisherId: requiredText(record.publisherId),
        collectionId: requiredText(record.collectionId),
        version: requiredText(record.version),
        digest: requiredText(record.digest),
        approvedBrowserRiskDigest: requiredText(record.approvedBrowserRiskDigest),
    };
}

function sameRelease(
    value: { publisherId: string; collectionId: string; version: string; digest: string },
    reference: Pick<ReleaseReference, "publisherId" | "collectionId" | "version" | "digest">,
): boolean {
    return (
        value.publisherId === reference.publisherId &&
        value.collectionId === reference.collectionId &&
        value.version === reference.version &&
        value.digest === reference.digest
    );
}

import type { CollectionVerifier } from "repository/collections/sources/verification";
import { RepositoryRequestError } from "../../core/errors";
import { createHash, randomUUID } from "node:crypto";
import { link, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { isCollectionNamespace } from "repository/collections/core/namespace";
import { CollectionPublicationError } from "repository/collections/core/errors";
import { type AdmittedCollectionRelease } from "repository/collections/interfaces/CollectionAdmission";
import { DEFAULT_COLLECTION_LIMITS } from "repository/collections/core/limits";
import { verifyCollectionPublicationHistory } from "repository/collections/core/admission/history";
import { verifyStoredCollectionReleaseJson } from "repository/collections/core/admission/collectionArtifact";
import { resourceName, resourcePublisher, deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { snapshotCollectionAssets, verifyCollectionAssets } from "repository/collections/core/admission/assets";
import type { CollectionAssetDefinition } from "repository/collections/interfaces/CollectionAssets";
import type { VerifiedCollectionReleaseMetadata } from "repository/collections/interfaces/CollectionAdmission";
import { isRepositoryIdentifier } from "@bernouy/ulvia-contracts/compatibility";
import { durableWriteFile, ensureDurableDirectory, syncDirectory } from "repository/repository/filesystem/core/durable";
import { listDirectories, writeImmutableFile } from "../core/immutableFiles";
import { pruneRepository } from "../core/recovery";
import { assetFileName } from "../core/assetFiles";
import { ImmutableJsonCache } from "../core/immutableJsonCache";

export class LocalCollectionRepository {
    private readonly metadataCache = new ImmutableJsonCache<VerifiedCollectionReleaseMetadata>();

    constructor(
        private readonly root: string,
        private readonly verifier?: CollectionVerifier,
    ) {}

    async store(artifact: AdmittedCollectionRelease, beforeVisibility?: () => Promise<void>): Promise<boolean> {
        const { publisherId, collectionId, version } = artifact.release;
        const path = this.releasePath(publisherId, collectionId, version);
        const existing = await this.getMetadata(publisherId, collectionId, version);
        if (existing) {
            const added = assertSameDigest(existing, artifact);
            await beforeVisibility?.();
            return added;
        }
        const history = (await this.listMetadata())
            .filter((item) => item.release.collectionId === collectionId)
            .map((item) => item.release);
        await verifyCollectionPublicationHistory(history, artifact.release);
        const directory = join(this.root, "releases", publisherId, resourceName(collectionId));
        await ensureDurableDirectory(directory, this.root);
        const assetDirectory = join(this.root, "assets", "collections", releaseHash(artifact.canonicalJson));
        if (artifact.assets.length) {
            await ensureDurableDirectory(assetDirectory, this.root);
            for (const asset of artifact.assets) {
                const path = join(assetDirectory, assetFileName(asset.id));
                await writeImmutableFile(
                    path,
                    asset.bytes,
                    `Immutable collection asset already has different content: ${path}`,
                );
            }
        }
        const temporary = join(directory, `.${randomUUID()}.tmp`);
        await durableWriteFile(temporary, artifact.canonicalJson, { flag: "wx", mode: 0o600 });
        try {
            // All dependencies, including editable sources, must be durable before the release marker.
            await beforeVisibility?.();
            await link(temporary, path);
            await syncDirectory(directory);
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
            const winner = await this.getMetadata(publisherId, collectionId, version);
            if (!winner) {
                throw new Error("Concurrent release disappeared");
            }
            return assertSameDigest(winner, artifact);
        } finally {
            await rm(temporary, { force: true });
        }
    }

    async list(): Promise<AdmittedCollectionRelease[]> {
        return Promise.all(
            (await this.listMetadata()).map(async ({ release }) => {
                const artifact = await this.get(release.publisherId, release.collectionId, release.version);
                if (!artifact) {
                    throw new Error(
                        `Release disappeared: ${release.publisherId}/${release.collectionId}/${release.version}`,
                    );
                }
                return artifact;
            }),
        );
    }

    async listMetadata(): Promise<VerifiedCollectionReleaseMetadata[]> {
        const releases: VerifiedCollectionReleaseMetadata[] = [];
        for (const publisher of await listDirectories(join(this.root, "releases"))) {
            for (const collection of await listDirectories(join(this.root, "releases", publisher))) {
                const folder = join(this.root, "releases", publisher, collection);
                for (const entry of await readdir(folder, { withFileTypes: true })) {
                    if (!entry.isFile() || !entry.name.endsWith(".json")) {
                        continue;
                    }
                    const version = entry.name.slice(0, -5);
                    const artifact = await this.getMetadata(publisher, `${publisher}/${collection}`, version);
                    if (!artifact) {
                        throw new Error(`Release disappeared: ${publisher}/${collection}/${version}`);
                    }
                    releases.push(artifact);
                }
            }
        }
        return releases.sort((left, right) => coordinate(left).localeCompare(coordinate(right)));
    }

    async get(publisherId: string, collectionId: string, version: string): Promise<AdmittedCollectionRelease | null> {
        const metadata = await this.getMetadata(publisherId, collectionId, version);
        if (!metadata) {
            return null;
        }
        const assets = metadata.release.assets.map(({ id }) => ({
            id,
            bytes: Bun.file(join(this.assetDirectory(metadata.canonicalJson), assetFileName(id))),
        }));
        // getMetadata already verified current bytes, grammar, coordinates and canonical identity.
        // Its independent snapshot stays private until all asset checks have completed.
        deepFreeze(metadata);
        const snapshots = snapshotCollectionAssets(metadata.release.assets, assets, DEFAULT_COLLECTION_LIMITS);
        await verifyCollectionAssets(metadata.release.assets, snapshots);
        return Object.freeze({ ...metadata, assets: snapshots });
    }

    async getMetadata(
        publisherId: string,
        collectionId: string,
        version: string,
        signal?: AbortSignal,
    ): Promise<VerifiedCollectionReleaseMetadata | null> {
        signal?.throwIfAborted();
        const document = await this.readDocument(publisherId, collectionId, version);
        signal?.throwIfAborted();
        if (!document) {
            return null;
        }
        const { path, bytes, canonicalJson } = document;
        const cached = this.metadataCache.get(path, canonicalJson);
        if (cached) {
            return cached;
        }
        const artifact = this.verifier
            ? await this.verifier.metadataJson(canonicalJson, `sha256:${releaseHash(bytes)}`, signal)
            : await verifyStoredCollectionReleaseJson(bytes, `sha256:${releaseHash(bytes)}`);
        if (
            artifact.release.publisherId !== publisherId ||
            artifact.release.collectionId !== collectionId ||
            artifact.release.version !== version ||
            artifact.canonicalJson !== bytes.toString("utf8")
        ) {
            throw new Error(`Corrupt local release: ${publisherId}/${collectionId}/${version}`);
        }
        return this.metadataCache.set(path, canonicalJson, artifact);
    }

    async getAsset(
        publisherId: string,
        collectionId: string,
        version: string,
        assetId: string,
        metadataOnly = false,
    ): Promise<{ definition: CollectionAssetDefinition; bytes: Blob } | null> {
        const document = await this.readDocument(publisherId, collectionId, version);
        if (!document) {
            return null;
        }
        const project = (metadata: VerifiedCollectionReleaseMetadata) => ({
            definition: metadata.release.assets.find((asset) => asset.id === assetId),
            digest: metadata.digest,
        });
        let selected = this.metadataCache.project(document.path, document.canonicalJson, project);
        if (!selected) {
            const metadata = await this.getMetadata(publisherId, collectionId, version);
            if (!metadata) {
                return null;
            }
            selected = project(metadata);
        }
        const definition = selected.definition;
        if (!definition) {
            return null;
        }
        const bytes = Bun.file(
            join(this.root, "assets", "collections", selected.digest.slice("sha256:".length), assetFileName(assetId)),
        );
        if (metadataOnly) {
            return (await bytes.exists()) && bytes.size === definition.byteLength ? { definition, bytes } : null;
        }
        const snapshots = snapshotCollectionAssets([definition], [{ id: assetId, bytes }], {
            ...DEFAULT_COLLECTION_LIMITS,
            maxBundleBytes: DEFAULT_COLLECTION_LIMITS.maxAssetBytes,
        });
        await verifyCollectionAssets([definition], snapshots);
        return { definition, bytes };
    }

    async prune(): Promise<void> {
        await pruneRepository(this.root);
    }

    private async readDocument(publisherId: string, collectionId: string, version: string) {
        if (
            !isRepositoryIdentifier(publisherId) ||
            !isCollectionNamespace(collectionId) ||
            resourcePublisher(collectionId) !== publisherId ||
            !VERSION.test(version)
        ) {
            return null;
        }
        const path = this.releasePath(publisherId, collectionId, version);
        const bytes = await readFile(path).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                this.metadataCache.delete(path);
                return null;
            }
            throw error;
        });
        return bytes
            ? { path, bytes, canonicalJson: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) }
            : null;
    }

    private releasePath(publisherId: string, collectionId: string, version: string): string {
        if (
            resourcePublisher(collectionId) !== publisherId ||
            !isRepositoryIdentifier(publisherId) ||
            !VERSION.test(version)
        ) {
            throw new RepositoryRequestError("REJECTED", "Invalid collection coordinate");
        }
        return join(this.root, "releases", publisherId, resourceName(collectionId), `${version}.json`);
    }

    private assetDirectory(canonicalJson: string): string {
        return join(this.root, "assets", "collections", releaseHash(canonicalJson));
    }
}

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

type CollectionIdentity = Pick<AdmittedCollectionRelease, "digest" | "release">;

function assertSameDigest(existing: CollectionIdentity, candidate: CollectionIdentity): false {
    if (existing.digest !== candidate.digest) {
        throw new CollectionPublicationError("immutable_conflict");
    }
    return false;
}

function coordinate(artifact: CollectionIdentity): string {
    const { publisherId, collectionId, version } = artifact.release;
    return `${publisherId}/${collectionId}/${version}`;
}

function releaseHash(value: string | Uint8Array): string {
    return createHash("sha256").update(value).digest("hex");
}

import { createHash, randomUUID } from "node:crypto";
import { link, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
    isCollectionNamespace,
    parseCollectionReleaseJson,
    type AdmittedCollectionRelease,
    DEFAULT_COLLECTION_LIMITS,
    verifyCollectionPublicationEvolution,
    verifyStoredCollectionArtifact,
    verifyStoredCollectionRelease,
} from "cms-repository/exports/collections/index";
import { snapshotCollectionAssets, verifyCollectionAssets } from "cms-repository/collections/core/admission/assets";
import type { CollectionAssetDefinition } from "cms-repository/collections/interfaces/CollectionAssets";
import type { VerifiedCollectionReleaseMetadata } from "cms-repository/collections/interfaces/CollectionAdmission";
import { compareSemVer } from "cms-repository/exports/contracts/compatibility";
import { durableWriteFile, ensureDurableDirectory, syncDirectory } from "../core/durable";
import { pruneRepository } from "../core/recovery";

export class LocalCollectionRepository {
    constructor(private readonly root: string) {}

    async store(artifact: AdmittedCollectionRelease): Promise<boolean> {
        const { publisherId, collectionId, version } = artifact.release;
        const path = this.releasePath(publisherId, collectionId, version);
        const existing = await this.getMetadata(publisherId, collectionId, version);
        if (existing) {
            return assertSameDigest(existing, artifact);
        }
        const previous = (await this.listMetadata())
            .filter((item) => item.release.publisherId === publisherId && item.release.collectionId === collectionId)
            .sort((left, right) => compareSemVer(right.release.version, left.release.version))[0];
        if (previous) {
            await verifyCollectionPublicationEvolution(previous.release, artifact.release);
        }
        const directory = join(this.root, "releases", publisherId, collectionId);
        await ensureDurableDirectory(directory, this.root);
        const assetDirectory = join(this.root, "assets", "collections", releaseHash(artifact.canonicalJson));
        if (artifact.assets.length) {
            await ensureDurableDirectory(assetDirectory, this.root);
            for (const asset of artifact.assets) {
                await writeImmutable(join(assetDirectory, asset.id), new Uint8Array(await asset.bytes.arrayBuffer()));
            }
        }
        const temporary = join(directory, `.${randomUUID()}.tmp`);
        await durableWriteFile(temporary, artifact.canonicalJson, { flag: "wx", mode: 0o600 });
        try {
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
        for (const publisher of await directories(join(this.root, "releases"))) {
            for (const collection of await directories(join(this.root, "releases", publisher))) {
                const folder = join(this.root, "releases", publisher, collection);
                for (const entry of await readdir(folder, { withFileTypes: true })) {
                    if (!entry.isFile() || !entry.name.endsWith(".json")) {
                        continue;
                    }
                    const version = entry.name.slice(0, -5);
                    const artifact = await this.getMetadata(publisher, collection, version);
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
        const assets = await Promise.all(
            metadata.release.assets.map(async ({ id }) => ({
                id,
                bytes: await readFile(join(this.assetDirectory(metadata.canonicalJson), id)),
            })),
        );
        return verifyStoredCollectionArtifact(metadata.release, assets, metadata.digest);
    }

    async getMetadata(
        publisherId: string,
        collectionId: string,
        version: string,
    ): Promise<VerifiedCollectionReleaseMetadata | null> {
        if (!IDENTIFIER.test(publisherId) || !isCollectionNamespace(collectionId) || !VERSION.test(version)) {
            return null;
        }
        const path = this.releasePath(publisherId, collectionId, version);
        const bytes = await readFile(path).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") {
                return null;
            }
            throw error;
        });
        if (!bytes) {
            return null;
        }
        const parsed = parseCollectionReleaseJson(bytes);
        const artifact = await verifyStoredCollectionRelease(parsed, `sha256:${releaseHash(bytes)}`);
        if (
            artifact.release.publisherId !== publisherId ||
            artifact.release.collectionId !== collectionId ||
            artifact.release.version !== version ||
            artifact.canonicalJson !== bytes.toString("utf8")
        ) {
            throw new Error(`Corrupt local release: ${publisherId}/${collectionId}/${version}`);
        }
        return artifact;
    }

    async getAsset(
        publisherId: string,
        collectionId: string,
        version: string,
        assetId: string,
    ): Promise<{ definition: CollectionAssetDefinition; bytes: Uint8Array } | null> {
        const metadata = await this.getMetadata(publisherId, collectionId, version);
        const definition = metadata?.release.assets.find((asset) => asset.id === assetId);
        if (!metadata || !definition) {
            return null;
        }
        const bytes = new Uint8Array(await readFile(join(this.assetDirectory(metadata.canonicalJson), assetId)));
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

    private releasePath(publisherId: string, collectionId: string, version: string): string {
        return join(this.root, "releases", publisherId, collectionId, `${version}.json`);
    }

    private assetDirectory(canonicalJson: string): string {
        return join(this.root, "assets", "collections", releaseHash(canonicalJson));
    }
}

async function writeImmutable(path: string, bytes: Uint8Array): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await durableWriteFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    try {
        await link(temporary, path);
        await syncDirectory(dirname(path));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            throw error;
        }
        const winner = await readFile(path);
        if (!winner.equals(bytes)) {
            throw new Error(`Immutable collection asset already has different content: ${path}`);
        }
    } finally {
        await rm(temporary, { force: true });
    }
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

type CollectionIdentity = Pick<AdmittedCollectionRelease, "digest" | "release">;

function assertSameDigest(existing: CollectionIdentity, candidate: CollectionIdentity): false {
    if (existing.digest !== candidate.digest) {
        throw new Error(`Release ${coordinate(candidate)} already exists with different content`);
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

async function directories(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    });
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

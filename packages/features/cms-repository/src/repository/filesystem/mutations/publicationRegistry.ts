import { createHash } from "node:crypto";
import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import { checkCollectionHistory } from "../artifacts/collectionHistory";
import { RepositoryRequestError } from "../../core/errors";
import {
    admitCollectionReleaseJson,
    parseCollectionReleaseJson,
    CollectionPublicationError,
} from "cms-repository/exports/collections/index";
import type {
    PublicationEnvelope,
    RemoteCoordinate,
    RepositoryArtifactKind,
    RepositoryPublicationRegistry,
    RepositoryPublicationResult,
    RepositoryYankResult,
} from "cms-repository/repository/publication/types";
import { LocalArtifactFiles } from "../artifacts/files";
import { LocalCollectionRepository } from "../artifacts/collections";
import { LocalContractReleases } from "../contracts";
import { withRepositoryWriteLock } from "../core/lock";
import { LocalProviderReleases } from "../providers";
import { LocalRepositoryYanks } from "../yanks";
import type { FilesystemRepositoryCatalogueIndex } from "../catalogueIndex";

/** Reference filesystem adapter for the storage-independent publication endpoint. */
export class FilesystemRepositoryPublicationRegistry implements RepositoryPublicationRegistry {
    constructor(
        private readonly root: string,
        private readonly index?: FilesystemRepositoryCatalogueIndex,
    ) {}

    async publish(envelope: PublicationEnvelope): Promise<RepositoryPublicationResult> {
        const published = await withRepositoryWriteLock(this.root, async () => {
            const files = new LocalArtifactFiles(this.root);
            const yanks = new LocalRepositoryYanks(this.root);
            const contracts = new LocalContractReleases(files, yanks);
            if (envelope.kind === "collection") {
                const artifact = await admitCollectionReleaseJson(envelope.canonicalJson, envelope.assets, {
                    contracts: await contracts.catalogue(),
                });
                const added = await new LocalCollectionRepository(this.root).store(artifact);
                return result(envelope.kind, artifact.release, artifact.digest, added);
            }
            if (envelope.kind === "contract") {
                const { added, admission } = await contracts.publish(envelope.canonicalJson, envelope.assets);
                return result(envelope.kind, admission.release, admission.digest, added);
            }
            if (envelope.assets.length) {
                throw new RepositoryRequestError("REJECTED", "Provider manifests cannot contain assets");
            }
            const { added, admission } = await new LocalProviderReleases(files, contracts, yanks).release(
                envelope.canonicalJson,
            );
            return result(envelope.kind, admission.manifest, admission.digest, added);
        });
        this.index?.invalidate();
        return published;
    }

    async checkCollection(canonicalJson: string, namespace: string) {
        const release = parseCollectionReleaseJson(canonicalJson);
        if (canonicalizeIJson(release) !== canonicalJson) {
            throw new RepositoryRequestError("REJECTED", "Preflight requires canonical collection JSON");
        }
        if (release.publisherId !== namespace) {
            throw new RepositoryRequestError("REJECTED", "Collection is outside the owned namespace");
        }
        return withRepositoryWriteLock(this.root, async () => {
            const repository = new LocalCollectionRepository(this.root);
            const existing = await repository.getMetadata(namespace, release.collectionId, release.version);
            if (existing && existing.canonicalJson !== canonicalJson) {
                throw new CollectionPublicationError("immutable_conflict");
            }
            const digest = `sha256:${createHash("sha256").update(canonicalJson).digest("hex")}`;
            return { complete: existing ? true : await checkCollectionHistory(this.root, release, repository), digest };
        });
    }

    async getPublicationState(coordinate: RemoteCoordinate) {
        await assertPublished(this.root, coordinate);
        return new LocalRepositoryYanks(this.root).state(
            coordinate.kind,
            coordinate.publisherId,
            coordinate.id,
            coordinate.version,
        );
    }

    async setYank(
        coordinate: RemoteCoordinate,
        reason: string | null,
        expectedRevision?: number,
    ): Promise<RepositoryYankResult> {
        const result = await withRepositoryWriteLock(this.root, async () => {
            await assertPublished(this.root, coordinate);
            const yank = await new LocalRepositoryYanks(this.root).set(
                coordinate.kind,
                coordinate.publisherId,
                coordinate.id,
                coordinate.version,
                reason,
                expectedRevision,
            );
            return { ...coordinate, yank };
        });
        this.index?.invalidate();
        return result;
    }
}

async function assertPublished(root: string, coordinate: RemoteCoordinate): Promise<void> {
    if (coordinate.kind === "collection") {
        const release = await new LocalCollectionRepository(root).getMetadata(
            coordinate.publisherId,
            coordinate.id,
            coordinate.version,
        );
        if (!release) {
            throw new RepositoryRequestError("NOT_FOUND", "Collection release is not published");
        }
        return;
    }
    const files = new LocalArtifactFiles(root);
    const type = coordinate.kind === "contract" ? "contracts" : "providers";
    if (!(await files.get(type, coordinate.publisherId, coordinate.id, coordinate.version))) {
        throw new RepositoryRequestError("NOT_FOUND", `${coordinate.kind} release is not published`);
    }
}

function result(
    kind: RepositoryArtifactKind,
    release: unknown,
    digest: string,
    added: boolean,
): RepositoryPublicationResult {
    return { kind, added, digest, release };
}

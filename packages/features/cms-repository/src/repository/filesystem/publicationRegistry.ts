import { admitCollectionReleaseJson } from "cms-repository/exports/collections/index";
import type {
    PublicationEnvelope,
    RemoteCoordinate,
    RepositoryArtifactKind,
    RepositoryPublicationRegistry,
    RepositoryPublicationResult,
    RepositoryYankResult,
} from "cms-repository/repository/publication/types";
import { LocalArtifactFiles } from "./artifactFiles";
import { LocalCollectionRepository } from "./collections";
import { LocalContractReleases } from "./contracts";
import { withRepositoryWriteLock } from "./lock";
import { LocalProviderReleases } from "./providers";
import { LocalRepositoryYanks } from "./yanks";

/** Reference filesystem adapter for the storage-independent publication endpoint. */
export class FilesystemRepositoryPublicationRegistry implements RepositoryPublicationRegistry {
    constructor(private readonly root: string) {}

    async publish(envelope: PublicationEnvelope): Promise<RepositoryPublicationResult> {
        return withRepositoryWriteLock(this.root, async () => {
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
                throw new Error("Provider manifests cannot contain assets");
            }
            const { added, admission } = await new LocalProviderReleases(files, contracts, yanks).release(
                envelope.canonicalJson,
            );
            return result(envelope.kind, admission.manifest, admission.digest, added);
        });
    }

    async setYank(coordinate: RemoteCoordinate, reason: string | null): Promise<RepositoryYankResult> {
        return withRepositoryWriteLock(this.root, async () => {
            await assertPublished(this.root, coordinate);
            const yank = await new LocalRepositoryYanks(this.root).set(
                coordinate.kind,
                coordinate.publisherId,
                coordinate.id,
                coordinate.version,
                reason,
            );
            return { ...coordinate, yank };
        });
    }
}

async function assertPublished(root: string, coordinate: RemoteCoordinate): Promise<void> {
    if (coordinate.kind === "collection") {
        const release = await new LocalCollectionRepository(root).get(
            coordinate.publisherId,
            coordinate.id,
            coordinate.version,
        );
        if (!release) {
            throw new Error("Collection release is not published");
        }
        return;
    }
    const files = new LocalArtifactFiles(root);
    const type = coordinate.kind === "contract" ? "contracts" : "providers";
    if (!(await files.get(type, coordinate.publisherId, coordinate.id, coordinate.version))) {
        throw new Error(`${coordinate.kind} release is not published`);
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

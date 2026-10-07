import { admitCollectionReleaseJson } from "cms-repository/exports/collections/index";
import { admitConformanceEvidenceJson, parseConformanceSuiteJson } from "cms-repository/exports/contracts/index";
import { satisfiesVersionRange } from "cms-repository/exports/providers/index";
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
                throw new Error("Provider manifests cannot contain assets");
            }
            const { added, admission } = await new LocalProviderReleases(files, contracts, yanks).release(
                envelope.canonicalJson,
            );
            return result(envelope.kind, admission.manifest, admission.digest, added);
        });
        this.index?.invalidate();
        return published;
    }

    async setYank(coordinate: RemoteCoordinate, reason: string | null): Promise<RepositoryYankResult> {
        const result = await withRepositoryWriteLock(this.root, async () => {
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
        this.index?.invalidate();
        return result;
    }

    async publishEvidence(canonicalJson: string) {
        const published = await withRepositoryWriteLock(this.root, async () => {
            const evidence = await admitConformanceEvidenceJson(canonicalJson);
            const files = new LocalArtifactFiles(this.root);
            const contracts = new LocalContractReleases(files, new LocalRepositoryYanks(this.root));
            const contract = await contracts.getMetadata(
                evidence.evidence.contract.publisherId,
                evidence.evidence.contract.id,
                evidence.evidence.contract.version,
            );
            if (!contract || contract.digest !== evidence.evidence.contract.digest) {
                throw new Error("Conformance evidence refers to an unavailable contract release");
            }
            const dependencies = await conformanceDependencies(evidence.evidence.suite.canonicalJson, contracts);
            parseConformanceSuiteJson(evidence.evidence.suite.canonicalJson, contract, undefined, dependencies);
            const providers = new LocalProviderReleases(files, contracts, new LocalRepositoryYanks(this.root));
            const manifest = await providers.getMetadata(
                evidence.evidence.publisherId,
                evidence.evidence.providerId,
                evidence.evidence.providerManifest.version,
            );
            if (
                !manifest ||
                manifest.digest !== evidence.evidence.providerManifest.digest ||
                !satisfiesVersionRange(evidence.evidence.providerBuildVersion, manifest.manifest.buildVersionRange) ||
                !manifest.manifest.implementations.some(
                    (item) =>
                        item.contractId === evidence.evidence.contract.id &&
                        item.version === evidence.evidence.contract.version &&
                        item.digest === evidence.evidence.contract.digest,
                )
            ) {
                throw new Error("Conformance evidence is not covered by its provider manifest");
            }
            const added = await files.storeEvidence(
                evidence.evidence.providerId,
                evidence.evidence.contract.id,
                evidence.evidence.id,
                evidence.canonicalJson,
            );
            return {
                providerId: evidence.evidence.providerId,
                contractId: evidence.evidence.contract.id,
                evidenceId: evidence.evidence.id,
                added,
                digest: evidence.digest,
            };
        });
        this.index?.invalidate();
        return published;
    }
}

async function conformanceDependencies(source: string, contracts: LocalContractReleases) {
    const value = JSON.parse(source) as {
        dependencyProfiles?: readonly {
            releases?: readonly { contractId?: unknown; version?: unknown; digest?: unknown }[];
        }[];
    };
    const coordinates = new Map<string, { contractId: string; version: string; digest: string }>();
    for (const profile of value.dependencyProfiles ?? []) {
        for (const release of profile.releases ?? []) {
            if (
                typeof release.contractId === "string" &&
                typeof release.version === "string" &&
                typeof release.digest === "string"
            ) {
                coordinates.set(`${release.contractId}@${release.version}#${release.digest}`, release as never);
            }
        }
    }
    const catalogue = await contracts.catalogue({ includeYanks: false });
    return Promise.all(
        [...coordinates.values()].map(async (coordinate) => {
            const record = await catalogue.get(coordinate.contractId, coordinate.version);
            if (!record || record.admission.digest !== coordinate.digest) {
                throw new Error("Conformance evidence dependency is unavailable");
            }
            return record.admission;
        }),
    );
}

async function assertPublished(root: string, coordinate: RemoteCoordinate): Promise<void> {
    if (coordinate.kind === "collection") {
        const release = await new LocalCollectionRepository(root).getMetadata(
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

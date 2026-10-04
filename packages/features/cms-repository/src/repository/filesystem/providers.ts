import { admitProviderManifestJson, type AdmittedProviderManifest } from "cms-repository/exports/providers/index";
import { InMemoryProviderManifestCatalogue } from "cms-repository/exports/providers/catalogue";
import { LocalArtifactFiles } from "./artifactFiles";
import { LocalContractReleases } from "./contracts";
import { LocalRepositoryYanks } from "./yanks";

export class LocalProviderReleases {
    constructor(
        private readonly files: LocalArtifactFiles,
        private readonly contracts: LocalContractReleases,
        private readonly yanks?: LocalRepositoryYanks,
    ) {}

    async release(bytes: string): Promise<{ added: boolean; admission: AdmittedProviderManifest }> {
        const contracts = await this.contracts.catalogue();
        const admission = await admitProviderManifestJson(bytes, contracts);
        const catalogue = await this.catalogue();
        await catalogue.publish(admission);
        const { providerId, version, provenance } = admission.manifest;
        const added = await this.files.store(
            "providers",
            provenance.publisherId,
            providerId,
            version,
            admission.canonicalJson,
        );
        return { added, admission };
    }

    async catalogue(): Promise<InMemoryProviderManifestCatalogue> {
        // Reconstruct historical manifests before applying present-day contract availability.
        // A contract yank blocks new publications and selections, not access to old manifest bytes.
        const contracts = await this.contracts.catalogue({ includeYanks: false });
        const catalogue = new InMemoryProviderManifestCatalogue(contracts);
        for (const artifact of await this.files.list("providers")) {
            const previous = await admitProviderManifestJson(artifact.bytes, contracts);
            if (
                previous.manifest.provenance.publisherId !== artifact.publisherId ||
                previous.manifest.providerId !== artifact.id ||
                previous.manifest.version !== artifact.version ||
                previous.canonicalJson !== artifact.bytes.toString("utf8")
            ) {
                throw new Error(
                    `Corrupt local provider release: ${artifact.publisherId}/${artifact.id}/${artifact.version}`,
                );
            }
            await catalogue.publish(previous);
        }
        for (const { coordinate, yank } of (await this.yanks?.entries("provider-manifest")) ?? []) {
            const [, publisherId, providerId, version] = coordinate.split("\0");
            const record = await catalogue.get(providerId!, version!);
            if (!record || record.admission.manifest.provenance.publisherId !== publisherId) {
                throw new Error(`Yank refers to missing provider ${publisherId}/${providerId}@${version}`);
            }
            await catalogue.setYank(providerId!, version!, { reason: yank.reason });
        }
        return catalogue;
    }
}

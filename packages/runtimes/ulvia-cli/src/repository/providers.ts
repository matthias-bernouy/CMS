import { admitProviderManifestJson, type AdmittedProviderManifest } from "@bernouy/cms-repository/providers";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { LocalArtifactFiles } from "./artifactFiles";
import { LocalContractReleases } from "./contracts";

export class LocalProviderReleases {
    constructor(
        private readonly files: LocalArtifactFiles,
        private readonly contracts: LocalContractReleases,
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
        const contracts = await this.contracts.catalogue();
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
        return catalogue;
    }
}

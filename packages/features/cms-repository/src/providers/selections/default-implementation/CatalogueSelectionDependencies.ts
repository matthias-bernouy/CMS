import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { catalogueRevision } from "cms-repository/exports/contracts/protocol";
import type { ProviderInstallationStore } from "cms-repository/providers/installations/interfaces/ProviderInstallationStore";
import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import { ContractSelectionValidationError } from "../core/errors";
import { parseSelectionSiteId } from "../core/parseContractSelections";
import type {
    ContractSelectionDependencySnapshot,
    ContractSelectionDependencySource,
} from "../interfaces/ContractSelectionStore";

type CatalogueRecords = Awaited<ReturnType<CatalogueSelectionDependencies["read"]>>;

function compareOrdinal(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

/** Optimistic coherent capture across immutable catalogues and revisioned installations. */
export class CatalogueSelectionDependencies implements ContractSelectionDependencySource {
    constructor(
        readonly releases: ReleaseCatalogue,
        readonly manifests: ProviderManifestCatalogue,
        readonly installationStore: ProviderInstallationStore,
    ) {}

    async capture(siteId: string): Promise<ContractSelectionDependencySnapshot> {
        const site = parseSelectionSiteId(siteId);
        const fast = this.hasMetadataRevisions();
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const before = fast ? await this.revision(site) : undefined;
            const records = await this.read(site);
            const revision = before ?? (await fingerprint(site, records));
            const after = fast ? await this.revision(site) : await fingerprint(site, await this.read(site));
            if (revision === after) {
                return {
                    releases: this.releases,
                    manifests: this.manifests,
                    installations: records.installations.map((record) => record.installation),
                    revision,
                };
            }
        }
        throw new ContractSelectionValidationError("stale_dependencies", "catalogue state changed during capture");
    }

    async isCurrent(siteId: string, revision: string): Promise<boolean> {
        const site = parseSelectionSiteId(siteId);
        return revision === (await this.revision(site));
    }

    async revision(siteId: string): Promise<string> {
        const site = parseSelectionSiteId(siteId);
        if (!this.hasMetadataRevisions()) {
            return fingerprint(site, await this.read(site));
        }
        const [releases, manifests, installations] = await Promise.all([
            this.releases.revision!(),
            this.manifests.revision!(),
            this.installationStore.revision!(site),
        ]);
        return catalogueRevision({ siteId: site, releases, manifests, installations });
    }

    async read(siteId: string) {
        const [releases, manifests, installations] = await Promise.all([
            this.releases.list(),
            this.manifests.list(),
            this.installationStore.list(siteId),
        ]);
        return { releases, manifests, installations };
    }

    private hasMetadataRevisions(): boolean {
        return (
            typeof this.releases.revision === "function" &&
            typeof this.manifests.revision === "function" &&
            typeof this.installationStore.revision === "function"
        );
    }
}

async function fingerprint(siteId: string, records: CatalogueRecords): Promise<string> {
    return catalogueRevision({
        siteId,
        releases: records.releases
            .map((record) => ({
                id: record.admission.release.contractId,
                version: record.admission.release.version,
                digest: record.admission.digest,
                yank: record.yank ?? null,
                deprecation: record.deprecation ?? null,
            }))
            .sort((a, b) => compareOrdinal(a.id, b.id) || compareOrdinal(a.version, b.version)),
        manifests: records.manifests
            .map((record) => ({
                id: record.admission.manifest.providerId,
                version: record.admission.manifest.version,
                digest: record.admission.digest,
                yank: record.yank ?? null,
            }))
            .sort((a, b) => compareOrdinal(a.id, b.id) || compareOrdinal(a.version, b.version)),
        installations: records.installations
            .map((record) => ({
                id: record.installation.id,
                revision: record.revision,
            }))
            .sort((a, b) => compareOrdinal(a.id, b.id)),
    });
}

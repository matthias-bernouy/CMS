import { resolveContract } from "@bernouy/ulvia-contracts";
import { VerifiedArtifactCache } from "@bernouy/ulvia-contracts/catalogue";
import type { ContractReleaseReader, CatalogueContractRelease } from "@bernouy/ulvia-contracts/catalogue";
import type { ProviderManifestReader } from "@bernouy/ulvia-providers/catalogue";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";
import type { ProviderManifestDigest } from "@bernouy/ulvia-providers";
import { GatewayError } from "../GatewayError";

/** Execution uses immutable pins. Catalogue listing, yank and deprecation queries remain live. */
export class GatewayPinnedArtifacts {
    private readonly contracts = new VerifiedArtifactCache<
        Awaited<ReturnType<GatewayPinnedArtifacts["loadContract"]>>
    >();
    private readonly manifests = new VerifiedArtifactCache<{
        canonicalJson: string;
        record: NonNullable<Awaited<ReturnType<ProviderManifestReader["findByDigest"]>>>;
    }>();

    constructor(
        private readonly releases: ContractReleaseReader,
        private readonly providers: ProviderManifestReader,
    ) {}

    async contract(pin: Pick<ContractSelection, "contractId" | "version" | "digest">) {
        const bundle = await this.contracts.get(pin.digest, () => this.loadContract(pin));
        if (
            bundle.release.admission.release.contractId !== pin.contractId ||
            bundle.release.admission.release.version !== pin.version
        ) {
            throw new GatewayError("invalid_route", "selected contract identity disagrees with its immutable pin");
        }
        return bundle;
    }

    async manifest(digest: ProviderManifestDigest) {
        const bundle = await this.manifests.get(digest, async () => {
            const found = await this.providers.findByDigest(digest);
            if (!found || found.admission.digest !== digest) {
                throw new GatewayError("invalid_route", "approved manifest is missing or has a different digest");
            }
            return {
                canonicalJson: found.admission.canonicalJson,
                record: Object.freeze({ admission: found.admission, publishedAt: found.publishedAt }),
            };
        });
        return bundle.record;
    }

    private async loadContract(pin: Pick<ContractSelection, "contractId" | "version" | "digest">) {
        const concrete = await this.releases.get(pin.contractId, pin.version);
        if (!concrete || concrete.admission.digest !== pin.digest) {
            throw new GatewayError("invalid_route", "selected release is missing or has a different digest");
        }
        const resolved = await resolveContract(this.releases, concrete.admission);
        const records = await Promise.all(
            resolved.lineage.map(async ({ release, digest }, index) => {
                const found = index === 0 ? concrete : await this.releases.get(release.contractId, release.version);
                if (!found || found.admission.digest !== digest) {
                    throw new GatewayError("invalid_route", "requested ancestor release is missing or changed");
                }
                // Publication time and admitted bytes are immutable; mutable catalogue status is not an execution pin.
                return Object.freeze({ admission: found.admission, publishedAt: found.publishedAt });
            }),
        );
        return Object.freeze({
            canonicalJson: records.map((record) => record.admission.canonicalJson).join("\n"),
            release: records[0]!,
            lineage: resolved.lineage,
            records: Object.freeze(records) as readonly CatalogueContractRelease[],
        });
    }
}

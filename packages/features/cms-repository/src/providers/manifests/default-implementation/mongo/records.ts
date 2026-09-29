import type { Collection } from "mongodb";
import { deepFreeze } from "cms-repository/exports/contracts/protocol";
import type { AdmittedProviderManifest, ProviderManifestDigest } from "../../core/admission/admitProviderManifest";
import { verifyProviderManifestAdmission } from "../../core/admission/verifyProviderManifestAdmission";
import { ProviderManifestValidationError } from "../../core/errors";
import type { ProviderManifestLimits } from "../../core/limits";
import type { CatalogueProviderManifest, ProviderManifestYank } from "../../interfaces/ProviderManifestCatalogue";

export interface ManifestVersionEntry {
    readonly version: string;
    readonly digest: ProviderManifestDigest;
    readonly publishedAt: string;
    readonly yank?: ProviderManifestYank;
}

export interface ManifestHead {
    readonly _id: string;
    readonly revision: number;
    readonly publisherId: string;
    readonly versions: readonly ManifestVersionEntry[];
}

export interface ManifestArtifact {
    readonly _id: ProviderManifestDigest;
    readonly admission: AdmittedProviderManifest;
}

export async function manifestRecord(
    artifact: ManifestArtifact | null,
    entry: ManifestVersionEntry,
    limits: Readonly<ProviderManifestLimits>,
): Promise<CatalogueProviderManifest> {
    if (!artifact || artifact._id !== entry.digest) {
        throw new ProviderManifestValidationError("invalid_manifest", "published manifest artifact is missing");
    }
    const admission = await verifyProviderManifestAdmission(artifact.admission, limits);
    if (admission.digest !== entry.digest || admission.manifest.version !== entry.version) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "published manifest artifact disagrees with catalogue",
        );
    }
    return deepFreeze({
        admission,
        publishedAt: entry.publishedAt,
        ...(entry.yank ? { yank: entry.yank } : {}),
    });
}

export async function recordsForHead(
    head: ManifestHead,
    artifacts: Collection<ManifestArtifact>,
    limits: Readonly<ProviderManifestLimits>,
): Promise<readonly CatalogueProviderManifest[]> {
    if (!Number.isSafeInteger(head.revision) || head.revision < 1 || head.versions.length > 2048) {
        throw new ProviderManifestValidationError("invalid_manifest", "published manifest index is invalid");
    }
    return Promise.all(
        head.versions.map(async (entry) => {
            const record = await manifestRecord(await artifacts.findOne({ _id: entry.digest }), entry, limits);
            if (
                record.admission.manifest.providerId !== head._id ||
                record.admission.manifest.provenance.publisherId !== head.publisherId
            ) {
                throw new ProviderManifestValidationError(
                    "invalid_manifest",
                    "published manifest index disagrees with artifact",
                );
            }
            return record;
        }),
    );
}

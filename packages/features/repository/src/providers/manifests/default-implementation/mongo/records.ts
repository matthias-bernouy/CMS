import type { Collection } from "mongodb";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import type { AdmittedProviderManifest, ProviderManifestDigest } from "@bernouy/ulvia-providers";
import { verifyProviderManifestAdmission } from "@bernouy/ulvia-providers/validation";
import { ProviderManifestValidationError } from "@bernouy/ulvia-providers";
import type { ProviderManifestLimits } from "@bernouy/ulvia-providers";
import type { CatalogueProviderManifest, ProviderManifestYank } from "@bernouy/ulvia-providers/catalogue";

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
    return manifestRecordFromAdmission(admission, entry);
}

export async function recordsForHead(
    head: ManifestHead,
    artifacts: Collection<ManifestArtifact>,
    limits: Readonly<ProviderManifestLimits>,
    read?: (entry: ManifestVersionEntry) => Promise<CatalogueProviderManifest>,
): Promise<readonly CatalogueProviderManifest[]> {
    if (!Number.isSafeInteger(head.revision) || head.revision < 1 || head.versions.length > 2048) {
        throw new ProviderManifestValidationError("invalid_manifest", "published manifest index is invalid");
    }
    return Promise.all(
        head.versions.map(async (entry) => {
            const record = await (read
                ? read(entry)
                : manifestRecord(await artifacts.findOne({ _id: entry.digest }), entry, limits));
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

export function manifestRecordFromAdmission(
    admission: AdmittedProviderManifest,
    entry: ManifestVersionEntry,
): CatalogueProviderManifest {
    if (admission.digest !== entry.digest || admission.manifest.version !== entry.version) {
        throw new ProviderManifestValidationError(
            "invalid_manifest",
            "Published index disagrees with verified artifact",
        );
    }
    return Object.freeze({
        admission,
        ...deepFreeze({ publishedAt: entry.publishedAt, ...(entry.yank ? { yank: entry.yank } : {}) }),
    });
}

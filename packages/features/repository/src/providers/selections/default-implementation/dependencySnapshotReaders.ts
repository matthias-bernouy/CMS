import type { ContractReleaseReader, CatalogueContractRelease } from "@bernouy/ulvia-contracts/catalogue";
import type { ProviderManifestReader, CatalogueProviderManifest } from "@bernouy/ulvia-providers/catalogue";

type Records = Readonly<{
    releases: readonly CatalogueContractRelease[];
    manifests: readonly CatalogueProviderManifest[];
}>;
const MAX_RECORDS = 128;
const MAX_TEXT_BYTES = 8 * 1024 ** 2;

/** Reuse only records already validated inside a revision-fenced catalogue capture. */
export function dependencySnapshotReaders(
    releases: ContractReleaseReader,
    manifests: ProviderManifestReader,
    records: Records,
): Readonly<{ releases: ContractReleaseReader; manifests: ProviderManifestReader }> {
    if (records.releases.length + records.manifests.length > MAX_RECORDS) {
        return { releases, manifests };
    }
    const textBytes = [...records.releases, ...records.manifests].reduce(
        (bytes, record) => bytes + record.admission.canonicalJson.length * 2,
        0,
    );
    if (textBytes > MAX_TEXT_BYTES) {
        // Oversized captures keep live readers; this reuse budget is never a domain refusal.
        return { releases, manifests };
    }
    const contracts = Object.freeze(
        records.releases.map((record) =>
            Object.freeze({
                ...record,
                ...(record.yank ? { yank: Object.freeze({ ...record.yank }) } : {}),
                ...(record.deprecation ? { deprecation: Object.freeze({ ...record.deprecation }) } : {}),
            }),
        ),
    );
    const providers = Object.freeze(
        records.manifests.map((record) =>
            Object.freeze({
                ...record,
                ...(record.yank ? { yank: Object.freeze({ ...record.yank }) } : {}),
            }),
        ),
    );
    // These are point-in-time readers. Only the dependency source can claim current revisions.
    return {
        releases: {
            get: async (id, version) =>
                contracts.find(
                    (record) =>
                        record.admission.release.contractId === id && record.admission.release.version === version,
                ) ?? null,
            findByDigest: async (digest) => contracts.find((record) => record.admission.digest === digest) ?? null,
            list: async (id) =>
                id === undefined
                    ? contracts
                    : Object.freeze(contracts.filter((record) => record.admission.release.contractId === id)),
            ...(releases.readDocumentation
                ? { readDocumentation: (digest, path) => releases.readDocumentation!(digest, path) }
                : {}),
        },
        manifests: {
            get: async (id, version) =>
                providers.find(
                    (record) =>
                        record.admission.manifest.providerId === id && record.admission.manifest.version === version,
                ) ?? null,
            findByDigest: async (digest) => providers.find((record) => record.admission.digest === digest) ?? null,
            list: async (id) =>
                id === undefined
                    ? providers
                    : Object.freeze(providers.filter((record) => record.admission.manifest.providerId === id)),
        },
    };
}

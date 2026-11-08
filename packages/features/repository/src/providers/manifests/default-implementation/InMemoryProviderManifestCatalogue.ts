import type { ReleaseCatalogue } from "repository/exports/contracts/catalogue";
import { compareSemVer, semVerReleaseTarget } from "@bernouy/ulvia-contracts/compatibility";
import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import type { AdmittedProviderManifest, ProviderManifestDigest } from "@bernouy/ulvia-providers";
import { verifyStoredProviderManifestJson } from "@bernouy/ulvia-providers";
import { validateProviderManifestReferences } from "@bernouy/ulvia-providers/validation";
import { verifyProviderManifestAdmission } from "@bernouy/ulvia-providers/validation";
import { ProviderManifestValidationError } from "@bernouy/ulvia-providers";
import { normalizeManifestYank } from "@bernouy/ulvia-providers/validation";
import { DEFAULT_PROVIDER_MANIFEST_LIMITS, type ProviderManifestLimits } from "@bernouy/ulvia-providers";
import { normalizeProviderManifestLimits } from "@bernouy/ulvia-providers/validation";
import { compareOrdinal } from "@bernouy/ulvia-providers/validation";
import type { CatalogueProviderManifest, ProviderManifestYank } from "@bernouy/ulvia-providers/catalogue";
import type { ProviderManifestCatalogue } from "repository/providers/manifests/interfaces/ProviderManifestCatalogue";

export class InMemoryProviderManifestCatalogue implements ProviderManifestCatalogue {
    readonly #byKey = new Map<string, CatalogueProviderManifest>();
    readonly #byDigest = new Map<ProviderManifestDigest, CatalogueProviderManifest>();
    readonly #publishers = new Map<string, string>();
    readonly #contracts: ReleaseCatalogue;
    readonly #limits: Readonly<ProviderManifestLimits>;
    readonly #clock: () => Date;

    constructor(
        contracts: ReleaseCatalogue,
        limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
        clock: () => Date = () => new Date(),
    ) {
        this.#contracts = contracts;
        this.#limits = normalizeProviderManifestLimits(limits);
        this.#clock = clock;
    }

    async publish(admission: AdmittedProviderManifest): Promise<CatalogueProviderManifest> {
        const verified = await verifyProviderManifestAdmission(admission, this.#limits);
        return this.#insert(verified, this.#clock().toISOString());
    }

    async restore(
        canonicalJson: string,
        digest: ProviderManifestDigest,
        publishedAt: string,
    ): Promise<CatalogueProviderManifest> {
        const verified = await verifyStoredProviderManifestJson(canonicalJson, digest, this.#limits);
        return this.#insert(verified, publishedAt, true);
    }

    async #insert(
        admission: AdmittedProviderManifest,
        publishedAt: string,
        restoring = false,
    ): Promise<CatalogueProviderManifest> {
        const verified = admission;
        const historical = this.#existing(verified);
        if (historical) {
            return historical;
        }
        await validateProviderManifestReferences(verified.manifest, this.#contracts);
        // All ownership/conflict checks and writes follow the last await, keeping concurrent publications atomic.
        const { providerId, version, provenance } = verified.manifest;
        const key = manifestKey(providerId, version);
        const existing = this.#existing(verified);
        if (existing) {
            return existing;
        }
        const publisher = this.#publishers.get(providerId);
        if (publisher !== undefined && publisher !== provenance.publisherId) {
            throw new ProviderManifestValidationError(
                "invalid_manifest",
                "publisher ownership cannot change between manifest versions",
                "$.provenance.publisherId",
            );
        }
        if (this.#byDigest.has(verified.digest)) {
            throw new ProviderManifestValidationError(
                "invalid_manifest",
                "manifest digest is already assigned",
                "$.digest",
            );
        }
        if (!restoring) {
            const target = semVerReleaseTarget(version);
            const previous = [...this.#byKey.values()].filter(
                (record) =>
                    record.admission.manifest.providerId === providerId &&
                    semVerReleaseTarget(record.admission.manifest.version) === target,
            );
            if (previous.some((record) => compareSemVer(version, record.admission.manifest.version) <= 0)) {
                throw new ProviderManifestValidationError(
                    "invalid_manifest",
                    "manifest version must increase within its release target",
                    "$.version",
                );
            }
        }
        const record = Object.freeze({ admission: verified, publishedAt });
        this.#byKey.set(key, record);
        this.#byDigest.set(verified.digest, record);
        this.#publishers.set(providerId, provenance.publisherId);
        return record;
    }

    #existing(admission: AdmittedProviderManifest): CatalogueProviderManifest | undefined {
        const { providerId, version } = admission.manifest;
        const existing = this.#byKey.get(manifestKey(providerId, version));
        if (existing && existing.admission.digest !== admission.digest) {
            throw new ProviderManifestValidationError(
                "invalid_manifest",
                `${providerId}@${version} is already published`,
            );
        }
        return existing;
    }

    async get(providerId: string, version: string): Promise<CatalogueProviderManifest | null> {
        return this.#byKey.get(manifestKey(providerId, version)) ?? null;
    }

    async findByDigest(digest: ProviderManifestDigest): Promise<CatalogueProviderManifest | null> {
        return this.#byDigest.get(digest) ?? null;
    }

    async list(providerId?: string): Promise<readonly CatalogueProviderManifest[]> {
        const records = [...this.#byKey.values()].filter(
            (record) => providerId === undefined || record.admission.manifest.providerId === providerId,
        );
        records.sort((left, right) => {
            const previous = left.admission.manifest;
            const next = right.admission.manifest;
            return (
                compareOrdinal(previous.providerId, next.providerId) ||
                compareSemVer(previous.version, next.version) ||
                compareOrdinal(previous.version, next.version)
            );
        });
        return Object.freeze(records);
    }

    async setYank(
        providerId: string,
        version: string,
        yank: ProviderManifestYank | null,
    ): Promise<CatalogueProviderManifest> {
        const key = manifestKey(providerId, version);
        const existing = this.#byKey.get(key);
        if (!existing) {
            throw new ProviderManifestValidationError("invalid_manifest", `${providerId}@${version} is not published`);
        }
        const normalized = yank === null ? undefined : normalizeManifestYank(yank);
        const record = deepFreeze({
            admission: existing.admission,
            publishedAt: existing.publishedAt,
            ...(normalized ? { yank: normalized } : {}),
        }) as CatalogueProviderManifest;
        this.#byKey.set(key, record);
        this.#byDigest.set(existing.admission.digest, record);
        return record;
    }
}

function manifestKey(providerId: string, version: string): string {
    return `${providerId}\u0000${version}`;
}

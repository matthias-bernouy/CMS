import { ReleaseValidationError } from "../../core/protocol/errors";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../../core/protocol/limits";
import { deepFreeze } from "../../core/protocol/values";
import type { ReleaseDigest } from "../../core/admission/digest";
import type { AdmittedContractRelease } from "../../core/admission/admitContractRelease";
import { compareSemVer } from "../../core/compatibility/semver";
import type {
    CatalogueContractRelease,
    ContractReleaseDeprecation,
    ContractReleaseYank,
    ReleaseCatalogue,
} from "../../interfaces/ReleaseCatalogue";
import { verifyAdmission } from "cms-repository/contracts/core/admission/verifyAdmission";
import { verifyStoredContractReleaseJson } from "cms-repository/contracts/core/admission/admitContractRelease";
import { normalizeReleaseDeprecation, normalizeReleaseYank } from "./normalizeReleaseMetadata";
import { verifyRequirements } from "cms-repository/contracts/core/catalogue/verifyRequirements";
import { verifyEvolution } from "cms-repository/contracts/core/catalogue/verifyEvolution";

export class InMemoryReleaseCatalogue implements ReleaseCatalogue {
    readonly #byDigest = new Map<ReleaseDigest, CatalogueContractRelease>();
    readonly #byKey = new Map<string, CatalogueContractRelease>();
    readonly #limits: Readonly<ReleaseLimits>;
    readonly #clock: () => Date;

    constructor(limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS, clock: () => Date = () => new Date()) {
        this.#limits = Object.freeze({ ...limits });
        this.#clock = clock;
    }

    async publish(admission: AdmittedContractRelease): Promise<CatalogueContractRelease> {
        const verified = await verifyAdmission(admission, this.#limits);
        return this.#insert(verified, this.#clock().toISOString());
    }

    /** Restore already-published immutable metadata without loading its separately verified fixture bytes. */
    async restore(
        canonicalJson: string,
        digest: ReleaseDigest,
        publishedAt: string,
    ): Promise<CatalogueContractRelease> {
        const verified = await verifyStoredContractReleaseJson(canonicalJson, digest, this.#limits);
        return this.#insert(verified, publishedAt);
    }

    #insert(admission: AdmittedContractRelease, publishedAt: string): CatalogueContractRelease {
        const verified = admission;
        const { contractId, version } = verified.release;
        const key = releaseKey(contractId, version);
        const existing = this.#byKey.get(key);
        if (existing) {
            if (existing.admission.digest === verified.digest) {
                return existing;
            }
            throw new ReleaseValidationError("invalid_contract", `${contractId}@${version} is already published`);
        }
        const digestOwner = this.#byDigest.get(verified.digest);
        if (digestOwner) {
            throw new ReleaseValidationError("invalid_contract", "release digest is already assigned", "$.digest");
        }
        this.#assertPublisher(contractId, verified.release.publisherId);
        verifyRequirements(verified.release, [...this.#byKey.values()]);
        verifyEvolution(verified.release, [...this.#byKey.values()], this.#limits);
        const record = freezeRecord(verified, publishedAt);
        this.#byKey.set(key, record);
        this.#byDigest.set(verified.digest, record);
        return record;
    }

    async get(contractId: string, version: string): Promise<CatalogueContractRelease | null> {
        return this.#byKey.get(releaseKey(contractId, version)) ?? null;
    }

    async findByDigest(digest: ReleaseDigest): Promise<CatalogueContractRelease | null> {
        return this.#byDigest.get(digest) ?? null;
    }

    async list(contractId?: string): Promise<readonly CatalogueContractRelease[]> {
        const records = [...this.#byKey.values()].filter(
            (record) => contractId === undefined || record.admission.release.contractId === contractId,
        );
        records.sort((left, right) => compareSemVer(left.admission.release.version, right.admission.release.version));
        return Object.freeze(records);
    }

    #assertPublisher(contractId: string, publisherId: string): void {
        const published = [...this.#byKey.values()].find(
            (record) => record.admission.release.contractId === contractId,
        );
        if (published && published.admission.release.publisherId !== publisherId) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "publisher ownership cannot change between releases",
                "$.publisherId",
            );
        }
    }

    async setDeprecation(
        contractId: string,
        version: string,
        deprecation: ContractReleaseDeprecation | null,
    ): Promise<CatalogueContractRelease> {
        const key = releaseKey(contractId, version);
        const existing = this.#byKey.get(key);
        if (!existing) {
            throw new ReleaseValidationError("invalid_contract", `${contractId}@${version} is not published`);
        }
        const normalized =
            deprecation === null
                ? undefined
                : normalizeReleaseDeprecation(deprecation, contractId, version, (id, releaseVersion) =>
                      this.#byKey.has(releaseKey(id, releaseVersion)),
                  );
        const updated = freezeRecord(existing.admission, existing.publishedAt, normalized, existing.yank);
        this.#byKey.set(key, updated);
        this.#byDigest.set(existing.admission.digest, updated);
        return updated;
    }

    async setYank(
        contractId: string,
        version: string,
        yank: ContractReleaseYank | null,
    ): Promise<CatalogueContractRelease> {
        const key = releaseKey(contractId, version);
        const existing = this.#byKey.get(key);
        if (!existing) {
            throw new ReleaseValidationError("invalid_contract", `${contractId}@${version} is not published`);
        }
        const normalized = yank === null ? undefined : normalizeReleaseYank(yank);
        const updated = freezeRecord(existing.admission, existing.publishedAt, existing.deprecation, normalized);
        this.#byKey.set(key, updated);
        this.#byDigest.set(existing.admission.digest, updated);
        return updated;
    }
}

function releaseKey(contractId: string, version: string): string {
    return `${contractId}\u0000${version}`;
}

function freezeRecord(
    admission: AdmittedContractRelease,
    publishedAt: string,
    deprecation?: ContractReleaseDeprecation,
    yank?: ContractReleaseYank,
): CatalogueContractRelease {
    return deepFreeze({
        admission,
        publishedAt,
        ...(deprecation ? { deprecation } : {}),
        ...(yank ? { yank } : {}),
    }) as CatalogueContractRelease;
}

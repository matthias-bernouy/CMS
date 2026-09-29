import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";
import type { AdmittedContractRelease } from "../../core/admission/admitContractRelease";
import type { ReleaseDigest } from "../../core/admission/digest";
import { verifyAdmission } from "../../core/admission/verifyAdmission";
import { verifyEvolution } from "../../core/catalogue/verifyEvolution";
import { verifyRequirements } from "../../core/catalogue/verifyRequirements";
import { compareSemVer } from "../../core/compatibility/semver";
import { ReleaseValidationError } from "../../core/protocol/errors";
import { DEFAULT_RELEASE_LIMITS, type ReleaseLimits } from "../../core/protocol/limits";
import { catalogueRevision } from "../../core/protocol/revision";
import { normalizeReleaseDeprecation, normalizeReleaseYank } from "../memory/normalizeReleaseMetadata";
import type {
    CatalogueContractRelease,
    ContractReleaseDeprecation,
    ContractReleaseYank,
    ReleaseCatalogue,
} from "../../interfaces/ReleaseCatalogue";
import {
    type ReleaseArtifact,
    type ReleaseHead,
    type ReleaseVersionEntry,
    recordsForHead,
    releaseRecord,
} from "./records";

/** Immutable digest artifacts become visible only through a revisioned per-contract head. */
export class MongoReleaseCatalogue implements ReleaseCatalogue {
    readonly #heads;
    readonly #artifacts;
    readonly #limits: Readonly<ReleaseLimits>;

    constructor(
        db: Db,
        limits: Readonly<ReleaseLimits> = DEFAULT_RELEASE_LIMITS,
        private readonly clock: () => Date = () => new Date(),
    ) {
        this.#heads = db.collection<ReleaseHead>("cms_contract_heads");
        this.#artifacts = db.collection<ReleaseArtifact>("cms_contract_artifacts");
        this.#limits = Object.freeze({ ...limits });
    }

    async revision(): Promise<string> {
        const heads = await this.#heads.find({}, { projection: { _id: 1, revision: 1 } }).toArray();
        heads.sort((left, right) => (left._id < right._id ? -1 : left._id > right._id ? 1 : 0));
        return catalogueRevision(heads.map((head) => [head._id, head.revision]));
    }

    async get(contractId: string, version: string): Promise<CatalogueContractRelease | null> {
        const head = await this.#heads.findOne({ _id: contractId });
        const entry = head?.versions.find((item) => item.version === version);
        if (!head || !entry) {
            return null;
        }
        const record = await releaseRecord(await this.#artifacts.findOne({ _id: entry.digest }), entry, this.#limits);
        this.assertIdentity(head, record);
        return record;
    }

    async findByDigest(digest: ReleaseDigest): Promise<CatalogueContractRelease | null> {
        const artifact = await this.#artifacts.findOne({ _id: digest });
        if (!artifact) {
            return null;
        }
        return this.get(artifact.admission.release.contractId, artifact.admission.release.version).then((record) =>
            record?.admission.digest === digest ? record : null,
        );
    }

    async list(contractId?: string): Promise<readonly CatalogueContractRelease[]> {
        const heads =
            contractId === undefined
                ? await this.#heads.find({}).toArray()
                : await this.#heads.find({ _id: contractId }).toArray();
        const records = (
            await Promise.all(heads.map((head) => recordsForHead(head, this.#artifacts, this.#limits)))
        ).flat();
        records.sort((left, right) => compareSemVer(left.admission.release.version, right.admission.release.version));
        return Object.freeze(records);
    }

    async publish(value: AdmittedContractRelease): Promise<CatalogueContractRelease> {
        const admission = await verifyAdmission(value, this.#limits);
        if (admission.fixtureAssets?.length) {
            throw new ReleaseValidationError("invalid_contract", "Mongo fixture-asset storage is not available yet");
        }
        const { contractId, version, publisherId } = admission.release;
        const artifact: ReleaseArtifact = { _id: admission.digest, admission };
        for (;;) {
            const head = await this.#heads.findOne({ _id: contractId });
            const existing = head?.versions.find((entry) => entry.version === version);
            if (existing) {
                if (existing.digest !== admission.digest) {
                    throw new ReleaseValidationError(
                        "invalid_contract",
                        `${contractId}@${version} is already published`,
                    );
                }
                return (await this.get(contractId, version))!;
            }
            if (head?.publisherId && head.publisherId !== publisherId) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "publisher ownership cannot change",
                    "$.publisherId",
                );
            }
            if (head && head.versions.length >= 2048) {
                throw new ReleaseValidationError("invalid_contract", "contract has too many published releases");
            }
            verifyRequirements(admission.release, await this.list());
            verifyEvolution(
                admission.release,
                head ? await recordsForHead(head, this.#artifacts, this.#limits) : [],
                this.#limits,
            );
            try {
                await this.#artifacts.insertOne(structuredClone(artifact));
            } catch (error) {
                if (!duplicateKey(error)) {
                    throw error;
                }
            }
            const persisted = await this.#artifacts.findOne({ _id: admission.digest });
            if (!persisted || (await verifyAdmission(persisted.admission, this.#limits)).digest !== admission.digest) {
                throw new ReleaseValidationError(
                    "invalid_contract",
                    "persisted release artifact failed integrity verification",
                );
            }
            const entry: ReleaseVersionEntry = {
                version,
                digest: admission.digest,
                publishedAt: this.clock().toISOString(),
            };
            const next: ReleaseHead = {
                _id: contractId,
                revision: (head?.revision ?? 0) + 1,
                publisherId,
                versions: [...(head?.versions ?? []), entry],
            };
            if (await this.writeHead(head, next)) {
                return releaseRecord(artifact, entry, this.#limits);
            }
        }
    }

    async setDeprecation(contractId: string, version: string, value: ContractReleaseDeprecation | null) {
        const snapshot = value === null ? null : structuredClone(value);
        return this.updateEntry(contractId, version, (entry, head) => ({
            ...entry,
            deprecation:
                snapshot === null
                    ? undefined
                    : normalizeReleaseDeprecation(snapshot, contractId, version, (_id, candidate) =>
                          head.versions.some((item) => item.version === candidate),
                      ),
        }));
    }

    async setYank(contractId: string, version: string, value: ContractReleaseYank | null) {
        const snapshot = value === null ? null : structuredClone(value);
        return this.updateEntry(contractId, version, (entry) => ({
            ...entry,
            yank: snapshot === null ? undefined : normalizeReleaseYank(snapshot),
        }));
    }

    private async updateEntry(
        contractId: string,
        version: string,
        update: (entry: ReleaseVersionEntry, head: ReleaseHead) => ReleaseVersionEntry,
    ): Promise<CatalogueContractRelease> {
        for (;;) {
            const head = await this.#heads.findOne({ _id: contractId });
            const entry = head?.versions.find((item) => item.version === version);
            if (!head || !entry) {
                throw new ReleaseValidationError("invalid_contract", `${contractId}@${version} is not published`);
            }
            const changed = update(entry, head);
            const next = {
                ...head,
                revision: head.revision + 1,
                versions: head.versions.map((item) => (item.version === version ? changed : item)),
            };
            if (await this.writeHead(head, next)) {
                return releaseRecord(await this.#artifacts.findOne({ _id: entry.digest }), changed, this.#limits);
            }
        }
    }

    private async writeHead(before: ReleaseHead | null, after: ReleaseHead): Promise<boolean> {
        if (before) {
            const result = await this.#heads.replaceOne({ _id: before._id, revision: before.revision }, after);
            return result.matchedCount === 1;
        }
        try {
            await this.#heads.insertOne(after);
            return true;
        } catch (error) {
            if (duplicateKey(error)) {
                return false;
            }
            throw error;
        }
    }

    private assertIdentity(head: ReleaseHead, record: CatalogueContractRelease): void {
        if (
            record.admission.release.contractId !== head._id ||
            record.admission.release.publisherId !== head.publisherId
        ) {
            throw new ReleaseValidationError("invalid_contract", "published release index disagrees with artifact");
        }
    }
}

function duplicateKey(error: unknown): boolean {
    return error instanceof MongoServerError && error.code === 11000;
}

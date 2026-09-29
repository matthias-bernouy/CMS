import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { compareSemVer } from "cms-repository/exports/contracts/compatibility";
import { catalogueRevision } from "cms-repository/exports/contracts/protocol";
import type { AdmittedProviderManifest, ProviderManifestDigest } from "../../core/admission/admitProviderManifest";
import { validateProviderManifestReferences } from "../../core/admission/validateProviderManifest";
import { verifyProviderManifestAdmission } from "../../core/admission/verifyProviderManifestAdmission";
import { ProviderManifestValidationError } from "../../core/errors";
import {
    DEFAULT_PROVIDER_MANIFEST_LIMITS,
    normalizeProviderManifestLimits,
    type ProviderManifestLimits,
} from "../../core/limits";
import { normalizeManifestYank } from "../../core/admission/normalizeManifestYank";
import { compareOrdinal } from "../../core/values";
import type {
    CatalogueProviderManifest,
    ProviderManifestCatalogue,
    ProviderManifestYank,
} from "../../interfaces/ProviderManifestCatalogue";
import {
    type ManifestArtifact,
    type ManifestHead,
    type ManifestVersionEntry,
    manifestRecord,
    recordsForHead,
} from "./records";

/** Immutable manifest artifacts become visible through a revisioned per-provider head. */
export class MongoProviderManifestCatalogue implements ProviderManifestCatalogue {
    readonly #heads;
    readonly #artifacts;
    readonly #limits: Readonly<ProviderManifestLimits>;

    constructor(
        db: Db,
        private readonly contracts: ReleaseCatalogue,
        limits: Readonly<ProviderManifestLimits> = DEFAULT_PROVIDER_MANIFEST_LIMITS,
        private readonly clock: () => Date = () => new Date(),
    ) {
        this.#heads = db.collection<ManifestHead>("cms_manifest_heads");
        this.#artifacts = db.collection<ManifestArtifact>("cms_manifest_artifacts");
        this.#limits = normalizeProviderManifestLimits(limits);
    }

    async revision(): Promise<string> {
        const heads = await this.#heads.find({}, { projection: { _id: 1, revision: 1 } }).toArray();
        heads.sort((left, right) => (left._id < right._id ? -1 : left._id > right._id ? 1 : 0));
        return catalogueRevision(heads.map((head) => [head._id, head.revision]));
    }

    async get(providerId: string, version: string): Promise<CatalogueProviderManifest | null> {
        const head = await this.#heads.findOne({ _id: providerId });
        const entry = head?.versions.find((item) => item.version === version);
        if (!head || !entry) {
            return null;
        }
        const record = await manifestRecord(await this.#artifacts.findOne({ _id: entry.digest }), entry, this.#limits);
        this.assertIdentity(head, record);
        return record;
    }

    async findByDigest(digest: ProviderManifestDigest): Promise<CatalogueProviderManifest | null> {
        const artifact = await this.#artifacts.findOne({ _id: digest });
        if (!artifact) {
            return null;
        }
        const record = await this.get(artifact.admission.manifest.providerId, artifact.admission.manifest.version);
        return record?.admission.digest === digest ? record : null;
    }

    async list(providerId?: string): Promise<readonly CatalogueProviderManifest[]> {
        const heads =
            providerId === undefined
                ? await this.#heads.find({}).toArray()
                : await this.#heads.find({ _id: providerId }).toArray();
        const records = (
            await Promise.all(heads.map((head) => recordsForHead(head, this.#artifacts, this.#limits)))
        ).flat();
        records.sort((left, right) => {
            const a = left.admission.manifest;
            const b = right.admission.manifest;
            return (
                compareOrdinal(a.providerId, b.providerId) ||
                compareSemVer(a.version, b.version) ||
                compareOrdinal(a.version, b.version)
            );
        });
        return Object.freeze(records);
    }

    async publish(value: AdmittedProviderManifest): Promise<CatalogueProviderManifest> {
        const admission = await verifyProviderManifestAdmission(value, this.#limits);
        const { providerId, version, provenance } = admission.manifest;
        const historical = await this.get(providerId, version);
        if (historical) {
            if (historical.admission.digest !== admission.digest) {
                throw new ProviderManifestValidationError(
                    "invalid_manifest",
                    `${providerId}@${version} is already published`,
                );
            }
            return historical;
        }
        await validateProviderManifestReferences(admission.manifest, this.contracts);
        const artifact: ManifestArtifact = { _id: admission.digest, admission };
        for (;;) {
            const head = await this.#heads.findOne({ _id: providerId });
            const existing = head?.versions.find((entry) => entry.version === version);
            if (existing) {
                if (existing.digest !== admission.digest) {
                    throw new ProviderManifestValidationError(
                        "invalid_manifest",
                        `${providerId}@${version} is already published`,
                    );
                }
                return (await this.get(providerId, version))!;
            }
            if (head?.publisherId && head.publisherId !== provenance.publisherId) {
                throw new ProviderManifestValidationError(
                    "invalid_manifest",
                    "publisher ownership cannot change",
                    "$.provenance.publisherId",
                );
            }
            if (head && head.versions.length >= 2048) {
                throw new ProviderManifestValidationError(
                    "invalid_manifest",
                    "provider has too many manifest versions",
                );
            }
            try {
                await this.#artifacts.insertOne(structuredClone(artifact));
            } catch (error) {
                if (!duplicateKey(error)) {
                    throw error;
                }
            }
            const persisted = await this.#artifacts.findOne({ _id: admission.digest });
            if (
                !persisted ||
                (await verifyProviderManifestAdmission(persisted.admission, this.#limits)).digest !== admission.digest
            ) {
                throw new ProviderManifestValidationError(
                    "invalid_manifest",
                    "persisted manifest artifact failed integrity verification",
                );
            }
            const entry: ManifestVersionEntry = {
                version,
                digest: admission.digest,
                publishedAt: this.clock().toISOString(),
            };
            const next: ManifestHead = {
                _id: providerId,
                revision: (head?.revision ?? 0) + 1,
                publisherId: provenance.publisherId,
                versions: [...(head?.versions ?? []), entry],
            };
            if (await this.writeHead(head, next)) {
                return manifestRecord(artifact, entry, this.#limits);
            }
        }
    }

    async setYank(providerId: string, version: string, value: ProviderManifestYank | null) {
        const snapshot = value === null ? null : structuredClone(value);
        for (;;) {
            const head = await this.#heads.findOne({ _id: providerId });
            const entry = head?.versions.find((item) => item.version === version);
            if (!head || !entry) {
                throw new ProviderManifestValidationError(
                    "invalid_manifest",
                    `${providerId}@${version} is not published`,
                );
            }
            const changed: ManifestVersionEntry = {
                ...entry,
                yank: snapshot === null ? undefined : normalizeManifestYank(snapshot),
            };
            const next = {
                ...head,
                revision: head.revision + 1,
                versions: head.versions.map((item) => (item.version === version ? changed : item)),
            };
            if (await this.writeHead(head, next)) {
                return manifestRecord(await this.#artifacts.findOne({ _id: entry.digest }), changed, this.#limits);
            }
        }
    }

    private async writeHead(before: ManifestHead | null, after: ManifestHead): Promise<boolean> {
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

    private assertIdentity(head: ManifestHead, record: CatalogueProviderManifest): void {
        if (
            record.admission.manifest.providerId !== head._id ||
            record.admission.manifest.provenance.publisherId !== head.publisherId
        ) {
            throw new ProviderManifestValidationError(
                "invalid_manifest",
                "published manifest index disagrees with artifact",
            );
        }
    }
}

function duplicateKey(error: unknown): boolean {
    return error instanceof MongoServerError && error.code === 11000;
}

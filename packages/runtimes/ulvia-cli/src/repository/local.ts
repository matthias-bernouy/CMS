import { canonicalJsonBytes, type ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { FsIntegrationPackageCache } from "@bernouy/cms-integration-packages/fs";
import type { StoredIntegrationVerificationBundle } from "@bernouy/cms-integration-registry";
import { FsIntegrationVerificationBundleStore } from "@bernouy/cms-integration-registry/fs";
import { parseIntegrationDefinition, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { readManifest, type LocalPackageAdmission, type LocalPackageRecord, writeManifest } from "./manifest";

export type PulledPackage = Readonly<{
    package: ResolvedIntegrationPackage;
    definition: IntegrationDefinition;
    verification?: StoredIntegrationVerificationBundle;
    source: string;
}>;

export type StorePackageResult = Readonly<{
    record: LocalPackageRecord;
    added: boolean;
}>;

export class LocalIntegrationRepository {
    private readonly cache: FsIntegrationPackageCache;
    private readonly verifications: FsIntegrationVerificationBundleStore;
    private mutation = Promise.resolve();

    constructor(
        private readonly root: string,
        packageRoot: string,
    ) {
        this.cache = new FsIntegrationPackageCache({ root: packageRoot });
        this.verifications = new FsIntegrationVerificationBundleStore(root);
    }

    async init(): Promise<void> {
        await this.cache.init();
        await readManifest(this.root);
    }

    async list(): Promise<readonly LocalPackageRecord[]> {
        return (await readManifest(this.root)).packages;
    }

    async getRecord(kind: string, version: string): Promise<LocalPackageRecord | null> {
        return (await this.list()).find((record) => record.kind === kind && record.version === version) ?? null;
    }

    async getPackage(record: LocalPackageRecord): Promise<ResolvedIntegrationPackage> {
        const materialized = await this.cache.get(record.digest);
        if (!materialized) {
            throw new Error(`Local package ${record.kind}@${record.version} is missing for digest ${record.digest}`);
        }
        return {
            envelope: materialized.envelope,
            digest: materialized.digest,
            canonicalBytes: canonicalJsonBytes(materialized.envelope),
        };
    }

    async getVerification(record: LocalPackageRecord): Promise<StoredIntegrationVerificationBundle | null> {
        return record.verificationDigest ? await this.verifications.get(record.verificationDigest) : null;
    }

    async recordAdmission(
        kind: string,
        version: string,
        digest: string,
        admission: LocalPackageAdmission,
    ): Promise<LocalPackageRecord> {
        return await this.exclusive(async () => {
            const current = [...(await this.list())];
            const existing = current.find((record) => record.kind === kind && record.version === version);
            if (!existing || existing.digest !== digest) {
                throw new Error(`Cannot record admission for unknown local package ${kind}@${version}`);
            }
            const updated = { ...existing, admission };
            await writeManifest(
                this.root,
                current.map((record) => (record === existing ? updated : record)),
            );
            return updated;
        });
    }

    async store(input: PulledPackage): Promise<StorePackageResult> {
        const { kind, version } = input.package.envelope;
        assertVerificationTarget(input, kind, version);
        const materialized = await this.cache.materialize(input.package, {
            kind,
            version,
            digest: input.package.digest,
        });
        const verification = input.verification ? await this.verifications.put(input.verification) : undefined;
        await this.cache.recordReference(kind, version, materialized.digest);
        return await this.exclusive(async () => {
            const current = [...(await this.list())];
            const existing = current.find((record) => record.kind === kind && record.version === version);
            if (existing) {
                if (existing.digest !== materialized.digest) {
                    throw new Error(`Local package coordinate ${kind}@${version} already has a different digest`);
                }
                if (
                    existing.verificationDigest &&
                    verification &&
                    existing.verificationDigest !== verification.digest
                ) {
                    throw new Error(`Local verification for ${kind}@${version} already has a different digest`);
                }
                if (!existing.verificationDigest && verification) {
                    const enriched = { ...existing, verificationDigest: verification.digest };
                    await writeManifest(
                        this.root,
                        current.map((record) => (record === existing ? enriched : record)),
                    );
                    return { record: enriched, added: false };
                }
                return { record: existing, added: false };
            }
            const record: LocalPackageRecord = {
                kind,
                version,
                digest: materialized.digest,
                ...(verification ? { verificationDigest: verification.digest } : {}),
                source: input.source,
                pulledAt: new Date().toISOString(),
                definition: parseIntegrationDefinition(input.definition),
            };
            await writeManifest(this.root, [...current, record]);
            return { record, added: true };
        });
    }

    private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.mutation;
        let release!: () => void;
        this.mutation = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await operation();
        } finally {
            release();
        }
    }
}

function assertVerificationTarget(input: PulledPackage, kind: string, version: string): void {
    const target = input.verification?.envelope.target;
    if (
        target &&
        (target.kind !== kind || target.version !== version || target.packageDigest !== input.package.digest)
    ) {
        throw new Error("Local verification target does not match its package coordinate and digest");
    }
}

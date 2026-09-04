import { canonicalJsonBytes, type ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import {
    FsIntegrationPackageCache,
    type ExpectedIntegrationPackageIdentity,
    type MaterializedIntegrationPackage,
} from "@bernouy/cms-integration-packages/fs";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { loadIntegrationDefinitionFromVersionRoot } from "@bernouy/cms-integrations/fs";
import type { LocalPackageRecord } from "./manifest";

export class LocalPackageReader {
    private readonly cache: FsIntegrationPackageCache;
    private readonly materialized = new Map<string, Promise<MaterializedIntegrationPackage>>();
    private readonly definitions = new Map<string, Promise<IntegrationDefinition>>();

    constructor(root: string) {
        this.cache = new FsIntegrationPackageCache({ root });
    }

    async init(): Promise<void> {
        await this.cache.init();
    }

    async materialize(
        input: ResolvedIntegrationPackage,
        expected: ExpectedIntegrationPackageIdentity,
    ): Promise<MaterializedIntegrationPackage> {
        const materialized = await this.cache.materialize(input, expected);
        this.materialized.set(materialized.digest, Promise.resolve(materialized));
        return materialized;
    }

    async recordReference(kind: string, version: string, digest: string): Promise<void> {
        await this.cache.recordReference(kind, version, digest);
    }

    async getPackage(record: LocalPackageRecord): Promise<ResolvedIntegrationPackage> {
        const materialized = await this.getMaterialized(record);
        return {
            envelope: materialized.envelope,
            digest: materialized.digest,
            canonicalBytes: canonicalJsonBytes(materialized.envelope),
        };
    }

    async getDefinition(record: LocalPackageRecord): Promise<IntegrationDefinition> {
        const cached = this.definitions.get(record.digest);
        if (cached) {
            return await cached;
        }
        const pending = this.loadDefinition(record);
        this.definitions.set(record.digest, pending);
        try {
            return await pending;
        } catch (error) {
            this.definitions.delete(record.digest);
            throw error;
        }
    }

    private async getMaterialized(record: LocalPackageRecord): Promise<MaterializedIntegrationPackage> {
        const cached = this.materialized.get(record.digest);
        if (cached) {
            return await cached;
        }
        const pending = this.loadMaterialized(record);
        this.materialized.set(record.digest, pending);
        try {
            return await pending;
        } catch (error) {
            this.materialized.delete(record.digest);
            throw error;
        }
    }

    private async loadMaterialized(record: LocalPackageRecord): Promise<MaterializedIntegrationPackage> {
        const materialized = await this.cache.get(record.digest);
        if (!materialized) {
            throw new Error(`Local package ${record.kind}@${record.version} is missing for digest ${record.digest}`);
        }
        if (materialized.envelope.kind !== record.kind || materialized.envelope.version !== record.version) {
            throw new Error(`Local package ${record.kind}@${record.version} does not match digest ${record.digest}`);
        }
        return materialized;
    }

    private async loadDefinition(record: LocalPackageRecord): Promise<IntegrationDefinition> {
        const materialized = await this.getMaterialized(record);
        return await loadIntegrationDefinitionFromVersionRoot({
            definitionPath: materialized.envelope.definition,
            expectedKind: record.kind,
            expectedVersion: record.version,
            versionRoot: materialized.root,
        });
    }
}

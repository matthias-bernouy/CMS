import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import {
    FsIntegrationPackageCache,
    IntegrationPackageCacheCorruptionError,
    IntegrationPackageCacheReferenceConflictError,
    type MaterializedIntegrationPackage,
} from "@bernouy/cms-integration-packages/fs";
import { IntegrationRepositoryContractError } from "../../../core/errors";
import { assertExactIntegrationVersion } from "../../../core/definitions/versioning";
import { definitionSnapshotsEqual } from "../../../core/installation/snapshots";
import type {
    IntegrationPackageResolver,
    ResolveIntegrationPackageRequest,
    ResolvedIntegrationPackageRoot,
} from "../../../interfaces/IntegrationConnectorDeployer";
import { loadIntegrationDefinitionFromVersionRoot } from "../definitionLoader";
import { loadExactPackageSource } from "./source";

export type FsIntegrationPackageResolverConfig = {
    cache: FsIntegrationPackageCache;
    source: IntegrationPackageSource;
    embeddedSource?: IntegrationPackageSource;
};

export class FsIntegrationPackageResolver implements IntegrationPackageResolver {
    constructor(private readonly config: FsIntegrationPackageResolverConfig) {}

    async resolve(request: ResolveIntegrationPackageRequest): Promise<ResolvedIntegrationPackageRoot> {
        assertExactIntegrationVersion(request.version, "version");
        assertDigest(request.expectedDigest);
        const reference = request.expectedDigest
            ? null
            : await this.config.cache.getReference(request.kind, request.version);
        const pinnedDigest = request.expectedDigest ?? reference?.digest;
        if (pinnedDigest) {
            const cached = await this.cached(pinnedDigest);
            if (cached) {
                return request.expectedDigest
                    ? await this.resolveMaterialized(cached, request)
                    : await this.resolveAndRecord(cached, request);
            }
        }

        const input = await loadExactPackageSource({
            source: this.config.source,
            embeddedSource: this.config.embeddedSource,
            kind: request.kind,
            version: request.version,
            allowEmbeddedFallback:
                request.reason === "rerun" && !request.expectedDigest && request.allowEmbeddedFallback,
        });
        if (pinnedDigest && input.digest !== pinnedDigest) {
            throw new IntegrationRepositoryContractError();
        }
        const materialized = await this.config.cache.materialize(input, {
            kind: request.kind,
            version: request.version,
            ...(pinnedDigest ? { digest: pinnedDigest } : {}),
        });
        return request.expectedDigest
            ? await this.resolveMaterialized(materialized, request)
            : await this.resolveAndRecord(materialized, request);
    }

    private async resolveAndRecord(
        materialized: MaterializedIntegrationPackage,
        request: ResolveIntegrationPackageRequest,
    ): Promise<ResolvedIntegrationPackageRoot> {
        const resolved = await this.resolveMaterialized(materialized, request);
        try {
            await this.config.cache.recordReference(request.kind, request.version, materialized.digest);
        } catch (error) {
            if (error instanceof IntegrationPackageCacheReferenceConflictError) {
                throw new IntegrationRepositoryContractError();
            }
            throw error;
        }
        return resolved;
    }

    private async cached(digest: string): Promise<MaterializedIntegrationPackage | null> {
        try {
            return await this.config.cache.get(digest);
        } catch (error) {
            if (error instanceof IntegrationPackageCacheCorruptionError) {
                return null;
            }
            throw error;
        }
    }

    private async resolveMaterialized(
        materialized: MaterializedIntegrationPackage,
        request: ResolveIntegrationPackageRequest,
    ): Promise<ResolvedIntegrationPackageRoot> {
        if (
            materialized.envelope.kind !== request.kind ||
            materialized.envelope.version !== request.version ||
            (request.expectedDigest && materialized.digest !== request.expectedDigest)
        ) {
            throw new IntegrationRepositoryContractError();
        }
        let definition;
        try {
            definition = await loadIntegrationDefinitionFromVersionRoot({
                definitionPath: materialized.envelope.definition,
                expectedKind: request.kind,
                expectedVersion: request.version,
                versionRoot: materialized.root,
            });
            if (request.expectedDefinition && !definitionSnapshotsEqual(definition, request.expectedDefinition)) {
                throw new Error("materialized definition differs from the expected definition");
            }
        } catch {
            throw new IntegrationRepositoryContractError();
        }
        return {
            root: materialized.root,
            kind: request.kind,
            version: request.version,
            digest: materialized.digest,
            definition: request.expectedDefinition ? structuredClone(request.expectedDefinition) : definition,
        };
    }
}

function assertDigest(value: string | undefined): void {
    if (value !== undefined && !/^[a-f0-9]{64}$/.test(value)) {
        throw new IntegrationRepositoryContractError();
    }
}

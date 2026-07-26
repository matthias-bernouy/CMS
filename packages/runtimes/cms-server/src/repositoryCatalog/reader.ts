import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import {
    IntegrationRepositoryContractError,
    IntegrationRepositoryError,
    type IntegrationDefinitionRepository,
} from "@bernouy/cms-integrations";
import type {
    RepositoryCatalogIntegrationPage,
    RepositoryCatalogReader,
    RepositoryCatalogVersionPage,
} from "@bernouy/cms-repository/catalog";
import { HttpRepositoryCompatibilityReader } from "./compatibilityReader";
import { HttpRepositoryReleaseReader } from "./release/reader";
import { assertSummaryMatchesIndex, catalogIndex, catalogSummaries } from "./loading/definitionCatalog";
import { featuredVersion, RepositoryCatalogLoader } from "./loading/integrationLoader";
import { catalogDocument } from "./loading/projection";
import { BoundedCatalogWork, resolveRepositoryCatalogReaderLimits, type RepositoryCatalogReaderLimits } from "./limits";
import { RepositoryCatalogHttpTransport } from "./transport";

const DEFAULT_TIMEOUT_MS = 10_000;

export type HttpRepositoryCatalogReaderConfig = Readonly<{
    catalog: IntegrationDefinitionRepository;
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
    limits?: Partial<RepositoryCatalogReaderLimits>;
}>;

export class HttpRepositoryCatalogReader implements RepositoryCatalogReader {
    private readonly limits: RepositoryCatalogReaderLimits;
    private readonly loader: RepositoryCatalogLoader;

    constructor(private readonly config: HttpRepositoryCatalogReaderConfig) {
        this.limits = resolveRepositoryCatalogReaderLimits(config.limits);
        const transportConfig = {
            baseUrl: config.baseUrl,
            ...(config.fetch ? { fetch: config.fetch } : {}),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        };
        const transport = new RepositoryCatalogHttpTransport(transportConfig);
        const compatibility = new HttpRepositoryCompatibilityReader({
            ...transportConfig,
            maxResponseBytes: this.limits.compatibilityBytes,
        });
        const releases = new HttpRepositoryReleaseReader({
            ...transportConfig,
            maxResponseBytes: this.limits.releaseEvidenceBytes,
        });
        this.loader = new RepositoryCatalogLoader({
            catalog: config.catalog,
            transport,
            compatibility,
            releases,
            limits: this.limits,
        });
    }

    async listIntegrations() {
        return await this.guard(async () => {
            const work = new BoundedCatalogWork(this.limits.concurrency);
            const sources = await catalogSummaries(this.config.catalog, work, this.limits);
            const loaded = await Promise.all(
                sources.map(async (source) => {
                    const index = await catalogIndex(this.config.catalog, work, this.limits, source.kind);
                    if (!index) {
                        throw new IntegrationRepositoryContractError();
                    }
                    assertSummaryMatchesIndex(source, index);
                    return await this.loader.load(index, work);
                }),
            );
            return catalogDocument(
                loaded.map(({ summary }) => summary),
                loaded.flatMap(({ validators }) => validators),
            );
        });
    }

    async getIntegration(kind: string) {
        return await this.guard(async () => {
            assertIntegrationPackageKind(kind);
            const work = new BoundedCatalogWork(this.limits.concurrency);
            const index = await catalogIndex(this.config.catalog, work, this.limits, kind);
            if (!index) {
                return null;
            }
            const featured = featuredVersion(index);
            const loaded = await this.loader.load(index, work, featured);
            const value: RepositoryCatalogIntegrationPage = {
                integration: loaded.summary,
                featuredVersion: loaded.content!,
            };
            return catalogDocument(value, loaded.validators);
        });
    }

    async getVersion(kind: string, version: string) {
        return await this.guard(async () => {
            assertIntegrationPackageKind(kind);
            assertIntegrationPackageVersion(version);
            const work = new BoundedCatalogWork(this.limits.concurrency);
            const index = await catalogIndex(this.config.catalog, work, this.limits, kind);
            if (!index || !index.versions.some((entry) => entry.version === version)) {
                return null;
            }
            const loaded = await this.loader.load(index, work, version);
            const value: RepositoryCatalogVersionPage = { integration: loaded.summary, version: loaded.content! };
            return catalogDocument(value, loaded.validators);
        });
    }

    private async guard<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (error instanceof IntegrationRepositoryError) {
                throw error;
            }
            throw new IntegrationRepositoryContractError();
        }
    }
}

import { DEFAULT_INTEGRATION_PACKAGE_LIMITS } from "@bernouy/cms-integration-packages";

export const REPOSITORY_CATALOG_LIMITS = Object.freeze({
    integrations: 2_000,
    versionsPerIntegration: 2_000,
    sitemapPaths: 10_000,
    providers: 64,
    artifactTypes: 64,
    artifacts: 4_096,
    dependencies: 256,
    instructions: 128,
    compatibilityRevisions: 256,
    compatibilityBaselines: 256,
    compatibilityEvidence: 4_096,
    identifierBytes: 256,
    shortTextBytes: 1_024,
    descriptionBytes: 16_384,
    markdownBytes: DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxFileBytes,
    packageBytes: DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes,
});

const encoder = new TextEncoder();

export function boundedText(value: unknown, name: string, maxBytes: number, required = true): string | undefined {
    if (value === undefined && !required) {
        return;
    }
    if (typeof value !== "string" || (required && value.length === 0) || encoder.encode(value).byteLength > maxBytes) {
        throw new RepositoryCatalogDataError(`${name} must be a bounded string`);
    }
    return value;
}

export function boundedArray<T>(value: readonly T[], name: string, maxItems: number): readonly T[] {
    if (!Array.isArray(value) || value.length > maxItems) {
        throw new RepositoryCatalogDataError(`${name} exceeds its item limit`);
    }
    return value;
}

export class RepositoryCatalogDataError extends Error {
    readonly status = 502;

    constructor(message: string) {
        super(message);
        this.name = "RepositoryCatalogDataError";
    }
}

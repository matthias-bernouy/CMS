import { DEFAULT_INTEGRATION_PACKAGE_LIMITS } from "@bernouy/cms-integration-packages";

export type RepositoryCatalogReaderLimits = Readonly<{
    integrations: number;
    versionsPerIntegration: number;
    totalVersions: number;
    releaseNotesBytes: number;
    compatibilityBytes: number;
    releaseEvidenceBytes: number;
    compatibilityRevisions: number;
    concurrency: number;
}>;

export const DEFAULT_REPOSITORY_CATALOG_READER_LIMITS: RepositoryCatalogReaderLimits = Object.freeze({
    integrations: 2_000,
    versionsPerIntegration: 2_000,
    totalVersions: 10_000,
    releaseNotesBytes: DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxFileBytes,
    compatibilityBytes: 1_048_576,
    releaseEvidenceBytes: 2_097_152,
    compatibilityRevisions: 256,
    concurrency: 8,
});

export function resolveRepositoryCatalogReaderLimits(
    overrides: Partial<RepositoryCatalogReaderLimits> = {},
): RepositoryCatalogReaderLimits {
    const limits = { ...DEFAULT_REPOSITORY_CATALOG_READER_LIMITS, ...overrides };
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new RangeError(`Repository catalog limit ${name} must be a positive safe integer`);
        }
    }
    return Object.freeze(limits);
}

export class BoundedCatalogWork {
    private active = 0;
    private readonly waiting: Array<() => void> = [];

    constructor(private readonly concurrency: number) {}

    async run<T>(operation: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await operation();
        } finally {
            this.release();
        }
    }

    private async acquire(): Promise<void> {
        if (this.active < this.concurrency) {
            this.active += 1;
            return;
        }
        await new Promise<void>((resolve) => this.waiting.push(resolve));
        this.active += 1;
    }

    private release(): void {
        this.active -= 1;
        this.waiting.shift()?.();
    }
}

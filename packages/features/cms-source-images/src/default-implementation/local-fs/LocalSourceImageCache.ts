import { join } from "node:path";
import type {
    SourceImageCache,
    SourceImageCacheWrite,
    SourceImageDerivative,
    SourceImageLookup,
} from "../../interfaces/cache";
import { LocalDerivativeStore } from "./derivatives";
import { LocalLookupStore } from "./lookups";

export type LocalSourceImageCacheOptions = {
    directory: string;
    maxBytes?: number;
    maxEntries?: number;
    maxLookupEntries?: number;
    maxDerivativeAgeMs?: number;
    maxLookupAgeMs?: number;
    now?: () => number;
};

export class LocalSourceImageCache implements SourceImageCache {
    private readonly derivatives: LocalDerivativeStore;
    private readonly lookups: LocalLookupStore;
    private initialized: Promise<void> | undefined;

    constructor(options: LocalSourceImageCacheOptions) {
        const now = options.now ?? Date.now;
        this.derivatives = new LocalDerivativeStore(join(options.directory, "objects"), {
            maxBytes: options.maxBytes ?? 512 * 1024 * 1024,
            maxEntries: options.maxEntries ?? 10_000,
            maxAgeMs: options.maxDerivativeAgeMs ?? 7 * 24 * 60 * 60 * 1000,
            now,
        });
        this.lookups = new LocalLookupStore(join(options.directory, "lookups"), {
            maxEntries: options.maxLookupEntries ?? 20_000,
            maxAgeMs: options.maxLookupAgeMs ?? 24 * 60 * 60 * 1000,
            now,
        });
    }

    initialize(): Promise<void> {
        this.initialized ??= Promise.all([this.derivatives.initialize(), this.lookups.initialize()]).then(
            () => undefined,
        );
        return this.initialized;
    }

    async dispose(): Promise<void> {
        await this.initialized;
    }

    async getDerivative(key: string): Promise<SourceImageDerivative | null> {
        await this.initialize();
        return this.derivatives.get(key);
    }

    async putDerivative(key: string, value: SourceImageDerivative): Promise<SourceImageCacheWrite> {
        await this.initialize();
        return this.derivatives.put(key, value);
    }

    async deleteDerivative(key: string): Promise<void> {
        await this.initialize();
        await this.derivatives.delete(key);
    }

    async getLookup(key: string): Promise<SourceImageLookup | null> {
        await this.initialize();
        return this.lookups.get(key);
    }

    async putLookup(key: string, value: SourceImageLookup): Promise<void> {
        await this.initialize();
        await this.lookups.put(key, value);
    }

    async deleteLookup(key: string): Promise<void> {
        await this.initialize();
        await this.lookups.delete(key);
    }
}

import type {
    SourceImageCache,
    SourceImageCacheWrite,
    SourceImageDerivative,
    SourceImageLookup,
} from "../interfaces/cache";

export type InMemorySourceImageCacheOptions = {
    maxBytes?: number;
    maxEntries?: number;
    maxLookupEntries?: number;
    maxDerivativeAgeMs?: number;
    maxLookupAgeMs?: number;
    now?: () => number;
};

type DerivativeRecord = { value: SourceImageDerivative; lastAccess: number };

export class InMemorySourceImageCache implements SourceImageCache {
    private readonly derivatives = new Map<string, DerivativeRecord>();
    private readonly lookups = new Map<string, SourceImageLookup>();
    private bytes = 0;
    private readonly maxBytes: number;
    private readonly maxEntries: number;
    private readonly maxLookupEntries: number;
    private readonly maxDerivativeAgeMs: number;
    private readonly maxLookupAgeMs: number;
    private readonly now: () => number;

    constructor(options: InMemorySourceImageCacheOptions = {}) {
        this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
        this.maxEntries = options.maxEntries ?? 1_024;
        this.maxLookupEntries = options.maxLookupEntries ?? 4_096;
        this.maxDerivativeAgeMs = options.maxDerivativeAgeMs ?? 7 * 24 * 60 * 60 * 1000;
        this.maxLookupAgeMs = options.maxLookupAgeMs ?? 24 * 60 * 60 * 1000;
        this.now = options.now ?? Date.now;
    }

    async getDerivative(key: string): Promise<SourceImageDerivative | null> {
        const record = this.derivatives.get(key);
        if (!record) {
            return null;
        }
        if (this.now() - record.value.createdAt > this.maxDerivativeAgeMs) {
            await this.deleteDerivative(key);
            return null;
        }
        this.derivatives.delete(key);
        record.lastAccess = this.now();
        this.derivatives.set(key, record);
        return cloneDerivative(record.value);
    }

    async putDerivative(key: string, value: SourceImageDerivative): Promise<SourceImageCacheWrite> {
        await this.deleteDerivative(key);
        const stored = cloneDerivative(value);
        this.derivatives.set(key, { value: stored, lastAccess: this.now() });
        this.bytes += stored.bytes.byteLength;
        let evicted = 0;
        while (this.bytes > this.maxBytes || this.derivatives.size > this.maxEntries) {
            const oldest = this.derivatives.keys().next().value as string | undefined;
            if (!oldest) {
                break;
            }
            await this.deleteDerivative(oldest);
            evicted += 1;
        }
        return { evicted };
    }

    async deleteDerivative(key: string): Promise<void> {
        const existing = this.derivatives.get(key);
        if (existing) {
            this.bytes -= existing.value.bytes.byteLength;
            this.derivatives.delete(key);
        }
    }

    async getLookup(key: string): Promise<SourceImageLookup | null> {
        const value = this.lookups.get(key);
        if (!value) {
            return null;
        }
        if (this.now() - value.createdAt > this.maxLookupAgeMs) {
            this.lookups.delete(key);
            return null;
        }
        this.lookups.delete(key);
        this.lookups.set(key, value);
        return { ...value };
    }

    async putLookup(key: string, lookup: SourceImageLookup): Promise<void> {
        this.lookups.delete(key);
        this.lookups.set(key, { ...lookup });
        while (this.lookups.size > this.maxLookupEntries) {
            const oldest = this.lookups.keys().next().value as string | undefined;
            if (!oldest) {
                break;
            }
            this.lookups.delete(oldest);
        }
    }

    async deleteLookup(key: string): Promise<void> {
        this.lookups.delete(key);
    }

    get derivativeCount(): number {
        return this.derivatives.size;
    }

    get lookupCount(): number {
        return this.lookups.size;
    }

    get byteSize(): number {
        return this.bytes;
    }
}

function cloneDerivative(value: SourceImageDerivative): SourceImageDerivative {
    return { ...value, bytes: value.bytes.slice() };
}

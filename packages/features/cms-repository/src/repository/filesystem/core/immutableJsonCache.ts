type CacheEntry<T> = {
    canonicalJson: string;
    value: T;
};

/**
 * Reuses expensive verification for immutable JSON documents while still
 * checking their current bytes on every filesystem read.
 */
export class ImmutableJsonCache<T> {
    private readonly entries = new Map<string, CacheEntry<T>>();

    constructor(private readonly maximumEntries = 256) {}

    get(key: string, canonicalJson: string): T | null {
        const entry = this.entries.get(key);
        if (!entry || entry.canonicalJson !== canonicalJson) {
            this.entries.delete(key);
            return null;
        }
        this.entries.delete(key);
        this.entries.set(key, entry);
        return structuredClone(entry.value);
    }

    set(key: string, canonicalJson: string, value: T): T {
        this.entries.delete(key);
        this.entries.set(key, { canonicalJson, value });
        while (this.entries.size > this.maximumEntries) {
            this.entries.delete(this.entries.keys().next().value!);
        }
        return structuredClone(value);
    }

    delete(key: string): void {
        this.entries.delete(key);
    }
}

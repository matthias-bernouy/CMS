import { deepFreeze } from "cms-repository/exports/contracts/protocol";

type CacheEntry<T> = { canonicalJson: string; value: T; bytes: number };

/** Reuses verified immutable metadata while comparing current file bytes on every read. */
export class ImmutableJsonCache<T> {
    private readonly entries = new Map<string, CacheEntry<T>>();
    private bytes = 0;

    constructor(
        private readonly maximumEntries = 256,
        private readonly maximumBytes = 64 * 1024 * 1024,
    ) {}

    get(key: string, canonicalJson: string): T | null {
        return this.project(key, canonicalJson, (value) => value);
    }

    /** Clone only the requested projection, leaving the full frozen metadata inside the cache. */
    project<Result>(key: string, canonicalJson: string, project: (value: T) => Result): Result | null {
        const entry = this.entries.get(key);
        if (!entry || entry.canonicalJson !== canonicalJson) {
            this.delete(key);
            return null;
        }
        this.entries.delete(key);
        this.entries.set(key, entry);
        return structuredClone(project(entry.value));
    }

    set(key: string, canonicalJson: string, value: T): T {
        this.delete(key);
        // Charge both canonical text and the verified JSON representation against the payload budget.
        const bytes = canonicalJson.length * 2 + JSON.stringify(value).length * 2;
        if (bytes <= this.maximumBytes) {
            const frozen = structuredClone(value);
            deepFreeze(frozen);
            this.entries.set(key, { canonicalJson, value: frozen, bytes });
            this.bytes += bytes;
            while (this.entries.size > this.maximumEntries || this.bytes > this.maximumBytes) {
                this.delete(this.entries.keys().next().value!);
            }
        }
        return structuredClone(value);
    }

    delete(key: string): void {
        this.bytes -= this.entries.get(key)?.bytes ?? 0;
        this.entries.delete(key);
    }
}

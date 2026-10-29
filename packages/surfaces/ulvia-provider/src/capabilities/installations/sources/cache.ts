import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";

type Entry<T> = { value: T; bytes: number };

/** Per-instance immutable results; pending work and retained payloads have independent limits. */
export class CollectionSourceCache<T> {
    private readonly entries = new Map<string, Entry<T>>();
    private readonly pending = new Map<string, Promise<T>>();
    private bytes = 0;

    constructor(
        private readonly maxEntries: number,
        private readonly maxBytes: number,
        private readonly weight: (value: T) => number,
        private readonly maxPending = 16,
    ) {
        if ([maxEntries, maxBytes, maxPending].some((value) => !Number.isSafeInteger(value) || value < 1)) {
            throw new TypeError("Invalid collection cache limits");
        }
    }

    load(key: string, loader: () => Promise<T>): Promise<T> {
        const existing = this.entries.get(key);
        if (existing) {
            this.entries.delete(key);
            this.entries.set(key, existing);
            return Promise.resolve(existing.value);
        }
        const pending = this.pending.get(key);
        if (pending) {
            return pending;
        }
        if (this.pending.size >= this.maxPending) {
            return Promise.reject(new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503));
        }
        const work = Promise.resolve()
            .then(loader)
            .then((value) => {
                const bytes = this.weight(value);
                if (!Number.isSafeInteger(bytes) || bytes < 0) {
                    throw new TypeError("Invalid collection cache weight");
                }
                deepFreeze(value);
                if (bytes <= this.maxBytes) {
                    this.entries.set(key, { value, bytes });
                    this.bytes += bytes;
                    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
                        const oldest = this.entries.keys().next().value!;
                        this.bytes -= this.entries.get(oldest)!.bytes;
                        this.entries.delete(oldest);
                    }
                }
                return value;
            })
            .finally(() => {
                this.pending.delete(key);
            });
        this.pending.set(key, work);
        return work;
    }
}

import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { AdmittedCollectionRelease } from "@bernouy/cms-repository/collections";
import type { verifiedCatalogueEntry } from "./catalogue";

/** Host-owned public immutable evidence; never contains site configuration or authorization. */
export class CollectionSourceCaches {
    readonly metadata = new CollectionSourceCache<ReturnType<typeof verifiedCatalogueEntry>>(
        256,
        4 * 1024 * 1024,
        (value) => JSON.stringify(value).length * 2,
    );
    readonly admitted = new CollectionSourceCache<AdmittedCollectionRelease>(
        8,
        32 * 1024 * 1024,
        (value) => value.canonicalJson.length * 2 + value.assets.reduce((sum, asset) => sum + asset.bytes.size, 0),
    );
}

type Entry<T> = { value: T; bytes: number };
type Pending<T> = { promise: Promise<T>; controller: AbortController; users: number; settled: boolean };

/** Immutable public results; pending work and retained payloads have independent limits. */
export class CollectionSourceCache<T> {
    private readonly entries = new Map<string, Entry<T>>();
    private readonly pending = new Map<string, Pending<T>>();
    private bytes = 0;
    private readonly loads = new Set<Pending<T>>();

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

    load(key: string, loader: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
        if (signal?.aborted) {
            return Promise.reject(signal.reason);
        }
        const existing = this.entries.get(key);
        if (existing) {
            this.entries.delete(key);
            this.entries.set(key, existing);
            return Promise.resolve(existing.value);
        }
        const pending = this.pending.get(key);
        if (pending) {
            return this.wait(key, pending, signal);
        }
        if (this.loads.size >= this.maxPending) {
            return Promise.reject(new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503));
        }
        const entry: Pending<T> = {
            promise: undefined as unknown as Promise<T>,
            controller: new AbortController(),
            users: 0,
            settled: false,
        };
        const work = Promise.resolve()
            .then(() => loader(entry.controller.signal))
            .then((value) => {
                entry.controller.signal.throwIfAborted();
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
                entry.settled = true;
                this.loads.delete(entry);
                if (this.pending.get(key) === entry) {
                    this.pending.delete(key);
                }
            });
        this.loads.add(entry);
        entry.promise = work;
        this.pending.set(key, entry);
        return this.wait(key, entry, signal);
    }

    private wait(key: string, entry: Pending<T>, signal?: AbortSignal): Promise<T> {
        entry.users++;
        return new Promise((resolve, reject) => {
            let finished = false;
            const finish = (error: unknown, value?: T): void => {
                if (finished) {
                    return;
                }
                finished = true;
                signal?.removeEventListener("abort", abort);
                entry.users--;
                if (!entry.settled && entry.users === 0) {
                    entry.controller.abort(error);
                    if (this.pending.get(key) === entry) {
                        this.pending.delete(key);
                    }
                }
                if (error !== undefined) {
                    reject(error);
                } else {
                    resolve(value!);
                }
            };
            const abort = () => finish(signal!.reason);
            signal?.addEventListener("abort", abort, { once: true });
            if (signal?.aborted) {
                abort();
            }
            entry.promise.then(
                (value) => finish(undefined, value),
                (error) => finish(error),
            );
        });
    }
}

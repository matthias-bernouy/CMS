import type { ReleaseLimits } from "ulvia-contracts/core/protocol/limits";
import { storedVerificationInput } from "./input";
import { retainedSize } from "./size";

type Bounds = Readonly<{ maxEntries: number; maxBytes: number; maxPending: number; maxPendingBytes: number }>;
type Verify<T> = (source: string | Uint8Array, digest: unknown, limits: Readonly<ReleaseLimits>) => Promise<T>;
const DEFAULT_BOUNDS: Bounds = {
    maxEntries: 128,
    maxBytes: 8 * 1024 ** 2,
    maxPending: 128,
    maxPendingBytes: 8 * 1024 ** 2,
};

/** Cache only immutable verified structure; publication metadata and authority never enter this cache. */
export class StoredReleaseCache<T extends { readonly canonicalJson: string }> {
    private readonly values = new Map<string, { value: T; bytes: number }>();
    private readonly pending = new Map<string, Promise<T>>();
    private bytes = 0;
    private pendingBytes = 0;
    private readonly bounds: Bounds;
    constructor(
        private readonly verify: Verify<T>,
        bounds: Bounds = DEFAULT_BOUNDS,
    ) {
        for (const value of Object.values(bounds)) {
            if (!Number.isSafeInteger(value) || value < 1) {
                throw new TypeError("Stored release cache bounds must be positive safe integers");
            }
        }
        this.bounds = Object.freeze({ ...bounds });
    }

    snapshot() {
        return {
            entries: this.values.size,
            bytes: this.bytes,
            pending: this.pending.size,
            pendingBytes: this.pendingBytes,
        };
    }

    async get(input: string | Uint8Array, digest: unknown, limits: Readonly<ReleaseLimits>): Promise<T> {
        const request = storedVerificationInput(input, digest, limits);
        if (!request) {
            return this.verify(input, digest, limits);
        }
        const { key, source, limits: policy } = request;
        const cached = this.values.get(key);
        if (cached) {
            this.values.delete(key);
            this.values.set(key, cached);
            return cached.value;
        }
        const shared = this.pending.get(key);
        if (shared) {
            return shared;
        }
        const bytes = (key.length + source.length) * 2 + 512;
        if (this.pending.size >= this.bounds.maxPending || this.pendingBytes + bytes > this.bounds.maxPendingBytes) {
            // Cache saturation must not reject an otherwise valid admission or add retained pending inputs.
            return this.verify(source, digest, policy);
        }
        const load = Promise.resolve()
            .then(() => this.verify(source, digest, policy))
            .then((value) => {
                this.retain(key, value, bytes + retainedSize(value, this.bounds.maxBytes));
                return value;
            });
        this.pending.set(key, load);
        this.pendingBytes += bytes;
        try {
            return await load;
        } finally {
            if (this.pending.get(key) === load) {
                this.pending.delete(key);
                this.pendingBytes -= bytes;
            }
        }
    }

    private retain(key: string, value: T, bytes: number) {
        if (bytes > this.bounds.maxBytes) {
            return;
        }
        while (
            this.values.size &&
            (this.values.size >= this.bounds.maxEntries || this.bytes + bytes > this.bounds.maxBytes)
        ) {
            const oldest = this.values.keys().next().value!;
            this.bytes -= this.values.get(oldest)!.bytes;
            this.values.delete(oldest);
        }
        this.values.set(key, { value, bytes });
        this.bytes += bytes;
    }
}

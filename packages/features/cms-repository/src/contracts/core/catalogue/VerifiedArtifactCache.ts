/** Per-catalogue cache of verified immutable admissions. Mutable publication metadata stays outside. */
export class VerifiedArtifactCache<T extends { readonly canonicalJson: string }> {
    private readonly values = new Map<string, T>();
    private readonly pending = new Map<string, Promise<T>>();
    private bytes = 0;

    constructor(
        private readonly maxEntries = 128,
        private readonly maxBytes = 16 * 1024 * 1024,
    ) {}

    peek(key: string): T | undefined {
        const value = this.values.get(key);
        if (value) {
            this.values.delete(key);
            this.values.set(key, value);
        }
        return value;
    }

    async get(key: string, load: () => Promise<T>): Promise<T> {
        const cached = this.peek(key);
        if (cached) {
            return cached;
        }
        const shared = this.pending.get(key);
        if (shared) {
            return shared;
        }
        const pending = load().then((value) => {
            // Unretained concurrent loads may finish together when the pending bound is full.
            const winner = this.peek(key);
            if (winner) {
                return winner;
            }
            const size = value.canonicalJson.length * 2;
            if (size <= this.maxBytes && this.maxEntries > 0) {
                while (this.values.size && (this.values.size >= this.maxEntries || this.bytes + size > this.maxBytes)) {
                    const oldest = this.values.keys().next().value!;
                    this.bytes -= this.values.get(oldest)!.canonicalJson.length * 2;
                    this.values.delete(oldest);
                }
                this.values.set(key, value);
                this.bytes += size;
            }
            return value;
        });
        const retained = this.pending.size < this.maxEntries;
        if (retained) {
            this.pending.set(key, pending);
        }
        try {
            return await pending;
        } finally {
            if (this.pending.get(key) === pending) {
                this.pending.delete(key);
            }
        }
    }
}

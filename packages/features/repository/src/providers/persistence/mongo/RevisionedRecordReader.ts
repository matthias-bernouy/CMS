/** A fresh revision read gates every cache hit. All store mutations must increment that revision. */
export class RevisionedRecordReader<T> {
    private readonly entries = new Map<string, { revision: number; bytes: number; record: T }>();
    private bytes = 0;

    constructor(
        private readonly maxEntries = 32,
        private readonly maxBytes = 16 * 1024 * 1024,
    ) {}

    async get<D extends { revision: number }>(
        key: string,
        load: (revisionOnly: boolean) => Promise<D | null>,
        decode: (document: D) => T,
    ): Promise<T | null> {
        const cached = this.entries.get(key);
        if (cached) {
            const current = await load(true);
            if (!current) {
                this.remove(key);
                return null;
            }
            if (!Number.isSafeInteger(current.revision) || current.revision < 1) {
                this.remove(key);
                throw new Error("Stored record has invalid revision");
            }
            if (current.revision === cached.revision) {
                this.entries.delete(key);
                this.entries.set(key, cached);
                return cached.record;
            }
            this.remove(key);
        }
        const document = await load(false);
        if (!document) {
            return null;
        }
        const record = decode(document);
        const bytes = new TextEncoder().encode(JSON.stringify(record)).byteLength;
        this.remove(key);
        if (this.maxEntries > 0 && bytes <= this.maxBytes) {
            while (this.entries.size && (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes)) {
                this.remove(this.entries.keys().next().value!);
            }
            this.entries.set(key, { revision: document.revision, bytes, record });
            this.bytes += bytes;
        }
        return record;
    }

    private remove(key: string): void {
        const entry = this.entries.get(key);
        if (entry) {
            this.bytes -= entry.bytes;
            this.entries.delete(key);
        }
    }
}

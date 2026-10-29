/** Only a bypass decision is retained; every hinted request still loads a fresh origin response. */
export class NonCacheHints {
    private readonly entries = new Map<string, { expires: number; bytes: number }>();
    private bytes = 0;
    constructor(private readonly now: () => number) {}
    has(key: string): boolean {
        const entry = this.entries.get(key);
        if (entry && entry.expires > this.now()) {
            return true;
        }
        this.remove(key);
        return false;
    }
    set(key: string): void {
        const bytes = new TextEncoder().encode(key).byteLength;
        this.remove(key);
        if (bytes > 16 * 1024) {
            return;
        }
        while (this.entries.size >= 128 || this.bytes + bytes > 256 * 1024) {
            this.remove(this.entries.keys().next().value!);
        }
        this.entries.set(key, { bytes, expires: this.now() + 5000 });
        this.bytes += bytes;
    }
    clear(): void {
        this.entries.clear();
        this.bytes = 0;
    }
    snapshot() {
        return { entries: this.entries.size, bytes: this.bytes };
    }
    private remove(key: string): void {
        const entry = this.entries.get(key);
        if (entry) {
            this.entries.delete(key);
            this.bytes -= entry.bytes;
        }
    }
}

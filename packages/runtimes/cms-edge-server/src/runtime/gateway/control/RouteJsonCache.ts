const MAX_ENTRIES = 128;
const MAX_BYTES = 8 * 1024 * 1024;

/** Reuses only decoding of freshly fetched, identical route JSON within one tenant context. */
export class RouteJsonCache {
    readonly #entries = new Map<string, { value: object; bytes: number }>();
    #bytes = 0;

    constructor(
        private readonly kind: "reply" | "snapshot",
        private readonly maxEntries = MAX_ENTRIES,
        private readonly maxBytes = MAX_BYTES,
    ) {}

    parse(source: string): unknown {
        const cached = this.#entries.get(source);
        if (cached) {
            this.#entries.delete(source);
            this.#entries.set(source, cached);
            return cached.value;
        }
        const value: unknown = JSON.parse(source);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return value;
        }
        if (this.kind === "reply" && !("route" in value && typeof value.route === "string")) {
            return value;
        }
        const retained = immutableEntry(source, value, this.maxBytes);
        if (!retained || this.maxEntries < 1) {
            return value;
        }
        while (this.#entries.size >= this.maxEntries || this.#bytes + retained.bytes > this.maxBytes) {
            const oldest = this.#entries.keys().next().value!;
            this.#bytes -= this.#entries.get(oldest)!.bytes;
            this.#entries.delete(oldest);
        }
        this.#entries.set(source, retained);
        this.#bytes += retained.bytes;
        return value;
    }
}

function immutableEntry(source: string, value: object, maxBytes: number) {
    // Charge source, object/property overhead and decoded strings, conservatively counting duplicates.
    let bytes = 64 + source.length * 2;
    const pending: unknown[] = [value];
    const objects: object[] = [];
    while (pending.length) {
        if (bytes > maxBytes) {
            return null;
        }
        const item = pending.pop();
        if (typeof item === "string") {
            bytes += 32 + item.length * 2;
        } else if (item && typeof item === "object") {
            objects.push(item);
            bytes += 64;
            for (const [key, child] of Object.entries(item)) {
                bytes += 32 + key.length * 2;
                pending.push(child);
            }
        } else {
            bytes += 8;
        }
    }
    if (bytes > maxBytes) {
        return null;
    }
    // JSON.parse produces plain data without cycles/accessors. Iteration also handles deep valid JSON.
    for (const item of objects) {
        Object.freeze(item);
    }
    return { value, bytes };
}

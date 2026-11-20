import { retainedDefinitionBytes } from "./values";
import type { GatewayDefinitionValue, GatewayDefinitionEntry, GatewayDefinitionLease } from "./types";

/** Advertised definitions are leased, so concurrent fills cannot evict a reference in flight. */
export class GatewayDefinitionCache {
    private readonly entries = new Map<string, GatewayDefinitionEntry>();
    private bytes = 0;
    constructor(
        private readonly maxEntries = 128,
        private readonly maxBytes = 8 * 1024 ** 2,
    ) {
        if (![maxEntries, maxBytes].every((value) => Number.isSafeInteger(value) && value > 0)) {
            throw new TypeError("Gateway definition cache bounds must be positive safe integers");
        }
    }
    snapshot() {
        return {
            entries: this.entries.size,
            bytes: this.bytes,
            leased: [...this.entries.values()].filter((entry) => entry.leases > 0).length,
        };
    }
    lease(): GatewayDefinitionLease {
        const pinned = new Map(this.entries);
        for (const entry of pinned.values()) {
            entry.leases++;
        }
        let released = false;
        return {
            known: Object.freeze([...pinned.keys()]),
            get: (key) => {
                if (released) {
                    throw new TypeError("Gateway definition lease was released");
                }
                const entry = pinned.get(key);
                if (entry && this.entries.get(key) === entry) {
                    this.entries.delete(key);
                    this.entries.set(key, entry);
                }
                return entry;
            },
            release: () => {
                if (!released) {
                    released = true;
                    for (const entry of pinned.values()) {
                        entry.leases--;
                    }
                    pinned.clear();
                }
            },
        };
    }
    retain(key: string, json: string, value: GatewayDefinitionValue): void {
        const existing = this.entries.get(key);
        if (existing) {
            if (existing.json !== json) {
                throw new TypeError("Gateway definition identity changed");
            }
            return;
        }
        const bytes = retainedDefinitionBytes({ key, json, value }, this.maxBytes);
        if (bytes > this.maxBytes) {
            return;
        }
        while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
            const oldest = [...this.entries].find(([, entry]) => entry.leases === 0);
            if (!oldest) {
                return;
            }
            this.entries.delete(oldest[0]);
            this.bytes -= oldest[1].bytes;
        }
        this.entries.set(key, { json, value, bytes, leases: 0 });
        this.bytes += bytes;
    }
}

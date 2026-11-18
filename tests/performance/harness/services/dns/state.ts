import { isIPv4 } from "node:net";
import type { DnsRecord } from "./wire";

export const DNS_LIMIT = 4096;
export type DnsCounts = Readonly<{ requests: number; requestBytes: number; responseBytes: number }>;

/** Only synthetic performance.test records are accepted, with bounded count and payload. */
export function dnsState() {
    const records = new Map<string, DnsRecord>();
    const counters = new Map<string, DnsCounts>();
    const key = (name: string, type: number) => `${name.toLowerCase()}:${type}`;
    return {
        put(input: unknown) {
            if (!input || typeof input !== "object" || Array.isArray(input)) {
                throw new Error("Invalid DNS fixture record");
            }
            const value = input as Record<string, unknown>;
            if (
                Object.keys(value).sort().join(",") !== "name,type,value" ||
                typeof value.name !== "string" ||
                value.name.length > 253 ||
                !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.performance\.test$/u.test(value.name) ||
                !["TXT", "A"].includes(String(value.type)) ||
                typeof value.value !== "string" ||
                Buffer.byteLength(value.value) > 1024 ||
                (value.type === "A" && !isIPv4(value.value))
            ) {
                throw new Error("Invalid DNS fixture record");
            }
            const id = key(value.name, value.type === "TXT" ? 16 : 1);
            if (!records.has(id) && records.size >= DNS_LIMIT) {
                throw new Error("DNS fixture record bound exceeded");
            }
            records.set(id, { type: value.type as DnsRecord["type"], value: value.value });
        },
        get: (name: string, type: number) => records.get(key(name, type)),
        hasName: (name: string) => records.has(key(name, 1)) || records.has(key(name, 16)),
        remove(name: string, type: number) {
            records.delete(key(name, type));
            counters.delete(key(name, type));
        },
        count(name: string, type: number) {
            return counters.get(key(name, type)) ?? { requests: 0, requestBytes: 0, responseBytes: 0 };
        },
        record(name: string, type: number, requestBytes: number, responseBytes: number) {
            const id = key(name, type);
            if (!counters.has(id) && counters.size >= DNS_LIMIT) {
                throw new Error("DNS fixture counter bound exceeded");
            }
            const current = counters.get(id) ?? { requests: 0, requestBytes: 0, responseBytes: 0 };
            counters.set(id, {
                requests: current.requests + 1,
                requestBytes: current.requestBytes + requestBytes,
                responseBytes: current.responseBytes + responseBytes,
            });
        },
    };
}

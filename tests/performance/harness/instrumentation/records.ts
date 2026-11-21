import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export const PROBE_FILE = "/tmp/ulvia-capability-performance.ndjson";
export const TRACE_DIRECTORY = "/tmp/ulvia-capability-performance";
export type Scope = Readonly<{
    traceId: string;
    spanId?: string;
    publicBinding?: "ulvia/provider.tls" | "ulvia/cluster.logs";
}>;
export const scope = new AsyncLocalStorage<Scope>();
const counters = new Map<string, { records: number; bytes: number; overflow: boolean }>();
mkdirSync(TRACE_DIRECTORY, { recursive: true });

/** A restarted test-owned runtime cannot complete traces from its previous process epoch. */
export function beginProbeEpoch(file = PROBE_FILE, directory = TRACE_DIRECTORY): void {
    rmSync(directory, { force: true, recursive: true });
    mkdirSync(directory, { mode: 0o700 });
    writeFileSync(file, "", { mode: 0o600 });
    counters.clear();
}

export function traceFile(traceId: string): string {
    return `${TRACE_DIRECTORY}/${createHash("sha256").update(traceId).digest("hex")}.ndjson`;
}

/** Only metadata and counts may enter this writer. Inputs, outputs, headers and credentials are forbidden. */
export function record(value: Readonly<Record<string, unknown>>): void {
    const row = { ...scope.getStore(), ...value };
    const traceId = typeof row.traceId === "string" ? row.traceId : "";
    const path = traceId ? traceFile(traceId) : PROBE_FILE;
    let counter = counters.get(path);
    if (!counter) {
        counter = { records: 0, bytes: 0, overflow: false };
        counters.set(path, counter);
        if (counters.size > 4096) {
            counters.delete(counters.keys().next().value!);
        }
    }
    if (counter.overflow) {
        return;
    }
    const line = `${JSON.stringify(row)}\n`;
    counter.records++;
    counter.bytes += Buffer.byteLength(line);
    if (counter.records > 10_000 || counter.bytes > (traceId ? 2 : 16) * 1024 * 1024) {
        counter.overflow = true;
        appendFileSync(path, `${JSON.stringify({ kind: "overflow", traceId })}\n`);
        return;
    }
    appendFileSync(path, line);
}

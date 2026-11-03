import { docker } from "../docker";

type Work = Record<"http" | "mongo" | "log", Record<string, number>>;
type Row = { kind: keyof Work; name: string; traceId?: string };
const empty = (): Work => ({ http: {}, mongo: {}, log: {} });
export const workCount = (counts: Record<string, number>) => Object.values(counts).reduce((sum, n) => sum + n, 0);

/** Observe causal request work separately from unrelated requests and periodic recovery/telemetry. */
export async function requestWork(provider: string, edge: string, requestIds: readonly string[], reset = false) {
    const selected = new Set(requestIds);
    const requests = empty();
    const other = empty();
    for (const name of [provider, edge]) {
        const result = await docker([
            "exec",
            name,
            "bun",
            "-e",
            reset
                ? 'await Bun.write("/tmp/ulvia-performance-fetch.ndjson.work", "")'
                : 'console.log(JSON.stringify((await Bun.file("/tmp/ulvia-performance-fetch.ndjson.work").text()).trim().split("\\n").filter(Boolean).map(line => JSON.parse(line))))',
        ]);
        if (reset) {
            continue;
        }
        for (const row of JSON.parse(result.stdout.trim()) as Row[]) {
            const counts = (row.traceId && selected.has(row.traceId) ? requests : other)[row.kind];
            counts[row.name] = (counts[row.name] ?? 0) + 1;
        }
    }
    return { requests, other };
}

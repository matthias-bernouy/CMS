export type LogEntry = {
    id: string;
    event: string;
    level: string;
    service: string;
    time: string;
    durationMs?: number;
    requestId?: string;
};
export type LogPage = { items: LogEntry[]; from: string; to: string; nextCursor: string | null };
export type LogGroup = { id: string; entries: LogEntry[]; level: string; durationMs?: number };
const levels = ["trace", "debug", "info", "warn", "error", "fatal"];

export function groupLogs(entries: readonly LogEntry[]): LogGroup[] {
    const groups = new Map<string, LogGroup>();
    for (const entry of entries) {
        const key = entry.requestId ? `request:${entry.requestId}` : `entry:${entry.id}`;
        let group = groups.get(key);
        if (!group) {
            group = { id: entry.requestId || entry.id, entries: [], level: entry.level };
            groups.set(key, group);
        }
        group.entries.push(entry);
        if (levels.indexOf(entry.level) > levels.indexOf(group.level)) {
            group.level = entry.level;
        }
        if (entry.event === "http.request.completed" && typeof entry.durationMs === "number") {
            group.durationMs = Math.max(group.durationMs ?? 0, entry.durationMs);
        }
    }
    return [...groups.values()];
}

export function formatDuration(value: number | undefined, locale = "en"): string {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return "—";
    }
    const seconds = value >= 1000;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: seconds ? 2 : 1 }).format(seconds ? value / 1000 : value)} ${seconds ? "s" : "ms"}`;
}

export async function queryLogs(input: Record<string, unknown>, signal: AbortSignal): Promise<LogPage> {
    // Each submitted batch owns a cancellable request. Pagination keeps its submitted
    // filters while the controls may contain unapplied edits; grouping stays local.
    const response = await fetch("/.cms/query/ulvia/cms.observability/logs.query", {
        method: "QUERY",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, limit: 50 }),
        signal,
    });
    if (!response.ok) {
        throw new Error(`Journal request failed (${response.status})`);
    }
    const page = (await response.json()) as LogPage;
    if (!Array.isArray(page.items) || page.items.length > 50) {
        throw new Error("Invalid journal response");
    }
    return page;
}

export type DateRange = { from: string; to: string };

export function recentRange(minutes: number, now = Date.now()): DateRange {
    const to = new Date(now).toISOString();
    return { from: new Date(now - minutes * 60_000).toISOString(), to };
}

export function validRange(from: string, to: string): DateRange | null {
    const start = Date.parse(from);
    const end = Date.parse(to);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        return null;
    }
    return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

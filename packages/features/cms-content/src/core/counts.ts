import type { ValueCount } from "cms-content/interfaces/CmsRepository";

export function normalizeTags(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string" && t.length > 0);
    if (typeof raw === "string" && raw.trim().startsWith("[")) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === "string" && t.length > 0);
        } catch { /* fall through */ }
    }
    return [];
}

export function countValues(values: Iterable<string>): ValueCount[] {
    const counts = new Map<string, number>();
    for (const value of values) {
        if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => (b.count - a.count) || a.value.localeCompare(b.value));
}

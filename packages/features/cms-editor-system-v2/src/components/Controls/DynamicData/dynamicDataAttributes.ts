import type { DataScope } from "@bernouy/cms-content/editor";

export function parseDataScopes(raw: string | null): DataScope[] {
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed as DataScope[] : [];
    } catch {
        return [];
    }
}

/** Coerce the HTTP form or JSON representation; domain validation runs later. */
export function coerceTags(raw: unknown): string[] {
    if (!raw) {
        return [];
    }
    if (Array.isArray(raw)) {
        return raw.map((value) => String(value));
    }
    if (typeof raw === "string") {
        return raw.split(",");
    }
    return [];
}

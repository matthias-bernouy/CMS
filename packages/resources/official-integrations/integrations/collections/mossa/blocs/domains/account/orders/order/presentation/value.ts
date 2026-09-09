export type ObjectValue = Record<string, unknown>;

export function objectValue(value: unknown): ObjectValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : null;
}

export function objectValues(value: unknown): ObjectValue[] {
    return Array.isArray(value) ? value.map(objectValue).filter((item): item is ObjectValue => item !== null) : [];
}

export function minorAmount(value: unknown): number | null {
    const amount =
        typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

export function safeHttpUrl(value: unknown): string {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
        return "";
    }
}

export function longDate(value: unknown, locale: string): string {
    const date = new Date(String(value || ""));
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

export function routeUrl(template: string | null, values: Record<string, unknown>): string {
    return Object.entries(values).reduce(
        (result, [key, value]) => result.replaceAll(`{${key}}`, encodeURIComponent(String(value ?? ""))),
        template || "",
    );
}

export const TEXT_LIMITS = Object.freeze({ definitions: 4_096, locales: 32, length: 8192 });

export function textRecord(value: unknown): Record<string, unknown> {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    ) {
        throw new TypeError("Text data must be a plain object");
    }
    return value as Record<string, unknown>;
}

export function textKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
    if (Object.keys(value).some((key) => !allowed.includes(key))) {
        throw new TypeError("Unknown text field");
    }
}

export function textIdentifier(value: unknown): string {
    if (
        typeof value !== "string" ||
        !/^[a-z][a-z0-9-]{0,95}$/.test(value) ||
        ["constructor", "prototype"].includes(value)
    ) {
        throw new TypeError("Text identifiers must be lowercase names without dots");
    }
    return value;
}

export function textLocale(value: unknown): string {
    if (typeof value !== "string" || !value || value.length > 64) {
        throw new TypeError("Text locale must be a BCP 47 tag");
    }
    return Intl.getCanonicalLocales(value)[0]!;
}

export function parseTextValue(value: unknown): string {
    if (typeof value !== "string" || value.length > TEXT_LIMITS.length) {
        throw new TypeError("Text message exceeds its string bound");
    }
    if (/[{}]/.test(value)) {
        throw new TypeError("Collection texts do not support interpolation");
    }
    return value;
}

export function parseTextLocales(value: unknown): Readonly<Record<string, string>> {
    const entries = Object.entries(textRecord(value));
    if (entries.length > TEXT_LIMITS.locales) {
        throw new TypeError("Too many text locales");
    }
    const normalized = entries.map(([locale, message]) => [textLocale(locale), parseTextValue(message)] as const);
    if (new Set(normalized.map(([locale]) => locale)).size !== normalized.length) {
        throw new TypeError("Duplicate canonical text locale");
    }
    return Object.freeze(Object.fromEntries(normalized.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}

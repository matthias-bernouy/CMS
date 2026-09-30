import type { CollectionTextValue, TextParameterType } from "../../interfaces/CollectionText";

export const TEXT_LIMITS = Object.freeze({ definitions: 256, locales: 32, parameters: 16, length: 8192 });
const CATEGORIES = ["zero", "one", "two", "few", "many", "other"];

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

export function parseTextValue(
    value: unknown,
    parameters: Readonly<Record<string, TextParameterType>>,
    plural?: string,
): CollectionTextValue {
    const message = (candidate: unknown): string => {
        if (typeof candidate !== "string" || candidate.length > TEXT_LIMITS.length) {
            throw new TypeError("Text message exceeds its string bound");
        }
        const rest = candidate.replace(/\{([a-z][a-z0-9-]*)\}/g, (_match, name: string) => {
            if (!Object.hasOwn(parameters, name)) {
                throw new TypeError(`Undeclared text parameter: ${name}`);
            }
            return "";
        });
        if (/[{}]/.test(rest)) {
            throw new TypeError("Text messages only support {parameter} interpolation");
        }
        return candidate;
    };
    if (!plural) {
        return message(value);
    }
    const forms = textRecord(value);
    textKeys(forms, CATEGORIES);
    if (!Object.hasOwn(forms, "other")) {
        throw new TypeError("Plural messages require an other form");
    }
    return Object.freeze(
        Object.fromEntries(
            Object.entries(forms)
                .sort()
                .map(([key, item]) => [key, message(item)]),
        ),
    ) as CollectionTextValue;
}

export function parseTextLocales(
    value: unknown,
    parameters: Readonly<Record<string, TextParameterType>>,
    plural?: string,
): Readonly<Record<string, CollectionTextValue>> {
    const entries = Object.entries(textRecord(value));
    if (entries.length > TEXT_LIMITS.locales) {
        throw new TypeError("Too many text locales");
    }
    const normalized = entries.map(
        ([locale, message]) => [textLocale(locale), parseTextValue(message, parameters, plural)] as const,
    );
    if (new Set(normalized.map(([locale]) => locale)).size !== normalized.length) {
        throw new TypeError("Duplicate canonical text locale");
    }
    return Object.freeze(Object.fromEntries(normalized.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}

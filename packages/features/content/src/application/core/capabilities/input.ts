import { ContentCapabilityError } from "./errors";
export function languages(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return invalid();
    }
    return value.map(language);
}

export function language(value: unknown): string {
    const candidate = requiredText(value).trim();
    try {
        return Intl.getCanonicalLocales(candidate)[0] ?? invalid();
    } catch {
        return invalid();
    }
}

export function revision(value: unknown): number {
    return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : invalid();
}

export function optionalText(value: unknown): string | undefined {
    return typeof value === "string" && value.length ? value : undefined;
}

export function requiredText(value: unknown): string {
    return optionalText(value) ?? invalid();
}

function invalid(): never {
    throw new ContentCapabilityError("INVALID_INPUT");
}

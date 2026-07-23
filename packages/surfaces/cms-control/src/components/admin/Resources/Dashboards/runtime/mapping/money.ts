export type MoneyParseResult = { ok: true; value: number | "" } | { ok: false; message: string };

export function currencyFractionDigits(currency: string | undefined): number {
    if (!currency) {
        return 2;
    }
    try {
        return (
            new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2
        );
    } catch {
        return 2;
    }
}

export function formatMinorUnits(
    value: unknown,
    fractionDigits: number,
    allowDecimals: boolean,
    locale = dashboardLocale(),
): string {
    const minorUnits = integerValue(value);
    if (minorUnits === undefined) {
        return "";
    }
    const factor = 10n ** BigInt(fractionDigits);
    const absolute = minorUnits < 0n ? -minorUnits : minorUnits;
    const major = absolute / factor;
    const remainder = absolute % factor;
    const sign = minorUnits < 0n ? "-" : "";
    if (fractionDigits === 0 || (!allowDecimals && remainder === 0n)) {
        return `${sign}${major}`;
    }
    const separator = decimalSeparator(locale);
    return `${sign}${major}${separator}${remainder.toString().padStart(fractionDigits, "0")}`;
}

export function parseMajorUnits(rawValue: string, fractionDigits: number, allowDecimals: boolean): MoneyParseResult {
    const value = rawValue.trim().replaceAll(/\s/gu, "");
    if (!value) {
        return { ok: true, value: "" };
    }
    const pattern = allowDecimals && fractionDigits > 0 ? /^([+-]?)(\d+)(?:([,.])(\d+))?$/u : /^([+-]?)(\d+)$/u;
    const match = pattern.exec(value);
    if (!match) {
        return {
            ok: false,
            message: allowDecimals
                ? `Enter an amount with up to ${fractionDigits} decimal places.`
                : "Enter a whole amount without decimals.",
        };
    }
    const fraction = match[4] ?? "";
    if (fraction.length > fractionDigits) {
        return { ok: false, message: `Enter an amount with up to ${fractionDigits} decimal places.` };
    }
    const factor = 10n ** BigInt(fractionDigits);
    const major = BigInt(match[2]!);
    const minor = BigInt(fraction.padEnd(fractionDigits, "0") || "0");
    const signed = (match[1] === "-" ? -1n : 1n) * (major * factor + minor);
    const parsed = Number(signed);
    if (!Number.isSafeInteger(parsed)) {
        return { ok: false, message: "Enter a smaller amount." };
    }
    return { ok: true, value: parsed };
}

function integerValue(value: unknown): bigint | undefined {
    if (typeof value === "number" && Number.isSafeInteger(value)) {
        return BigInt(value);
    }
    if (typeof value === "string" && /^[+-]?\d+$/u.test(value)) {
        const parsed = BigInt(value);
        if (parsed <= BigInt(Number.MAX_SAFE_INTEGER) && parsed >= BigInt(Number.MIN_SAFE_INTEGER)) {
            return parsed;
        }
    }
    return undefined;
}

function dashboardLocale(): string {
    if (typeof navigator !== "undefined" && navigator.language) {
        return navigator.language;
    }
    return typeof document !== "undefined" && document.documentElement.lang ? document.documentElement.lang : "en-US";
}

function decimalSeparator(locale: string): string {
    return new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
}

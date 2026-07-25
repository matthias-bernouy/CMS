export type DashboardDisplayFormat = "text" | "badge" | "date" | "money";

type DashboardDisplayOptions = {
    currency?: string;
    locale?: string;
};

export function formatDashboardValue(
    value: unknown,
    format: DashboardDisplayFormat | undefined,
    options: DashboardDisplayOptions = {},
): string {
    if (format === "date") {
        return formatDashboardDate(value, options.locale);
    }
    if (format === "money") {
        return formatDashboardMoney(value, options.currency, options.locale);
    }
    return displayText(value);
}

export function formatDashboardDate(value: unknown, locale?: string): string {
    const raw = displayText(value).trim();
    if (!raw) {
        return "";
    }
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(raw);
    const date = dateOnly ? new Date(`${raw}T00:00:00`) : new Date(raw);
    if (!Number.isFinite(date.valueOf())) {
        return raw;
    }
    return new Intl.DateTimeFormat(locale, dateOnly ? { dateStyle: "medium" } : dateTimeOptions()).format(date);
}

export function formatDashboardMoney(value: unknown, currency?: string, locale?: string): string {
    const raw = displayText(value).trim();
    if (!raw) {
        return "";
    }
    const minorUnits = safeInteger(value);
    if (minorUnits === undefined) {
        return raw;
    }
    const normalizedCurrency = currency?.trim().toUpperCase();
    const fractionDigits = currencyFractionDigits(normalizedCurrency);
    const majorUnits = minorUnits / 10 ** fractionDigits;
    if (normalizedCurrency) {
        try {
            return new Intl.NumberFormat(locale, {
                style: "currency",
                currency: normalizedCurrency,
            }).format(majorUnits);
        } catch {
            return `${formatNumber(majorUnits, fractionDigits, locale)} ${normalizedCurrency}`;
        }
    }
    return formatNumber(majorUnits, fractionDigits, locale);
}

function displayText(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }
    if (Array.isArray(value)) {
        return value.map(displayText).filter(Boolean).join(", ");
    }
    return String(value);
}

function safeInteger(value: unknown): number | undefined {
    if (typeof value === "number") {
        return Number.isSafeInteger(value) ? value : undefined;
    }
    if (typeof value !== "string" || !/^[+-]?\d+$/u.test(value.trim())) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function currencyFractionDigits(currency: string | undefined): number {
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

function formatNumber(value: number, fractionDigits: number, locale?: string): string {
    return new Intl.NumberFormat(locale, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(value);
}

function dateTimeOptions(): Intl.DateTimeFormatOptions {
    return { dateStyle: "medium", timeStyle: "short" };
}

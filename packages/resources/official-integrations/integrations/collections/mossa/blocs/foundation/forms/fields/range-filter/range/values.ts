export type NumericRange = {
    minimum: number;
    maximum: number;
    step: number;
};

export type RangeValues = {
    minimum: number;
    maximum: number;
};

export function readNumericRange(host: HTMLElement): NumericRange {
    const first = finiteNumber(host.getAttribute("min"), 0);
    const second = finiteNumber(host.getAttribute("max"), 100);
    const minimum = Math.min(first, second);
    const maximum = Math.max(first, second);
    const step = Math.abs(finiteNumber(host.getAttribute("step"), 1)) || 1;
    return { minimum, maximum, step };
}

export function normalizeRangeValues(
    minimumValue: unknown,
    maximumValue: unknown,
    range: NumericRange,
    changed?: "minimum" | "maximum",
): RangeValues {
    let minimum = snapValue(minimumValue, range, range.minimum);
    let maximum = snapValue(maximumValue, range, range.maximum);
    if (minimum > maximum) {
        if (changed === "maximum") {
            maximum = minimum;
        } else {
            minimum = maximum;
        }
    }
    return { minimum, maximum };
}

export function serializeBoundary(value: number, boundary: number): string {
    return value === boundary ? "" : String(value);
}

export function formatRangeNumber(value: number, language: string, step: number): string {
    const maximumFractionDigits = Math.min(12, decimalPlaces(step));
    try {
        return new Intl.NumberFormat(language, { maximumFractionDigits, useGrouping: false }).format(value);
    } catch {
        return String(value);
    }
}

function snapValue(value: unknown, range: NumericRange, fallback: number): number {
    const number = value == null || (typeof value === "string" && value.trim() === "") ? Number.NaN : Number(value);
    if (!Number.isFinite(number)) {
        return fallback;
    }
    const clamped = Math.min(range.maximum, Math.max(range.minimum, number));
    const snapped = range.minimum + Math.round((clamped - range.minimum) / range.step) * range.step;
    const precision = Math.min(12, Math.max(decimalPlaces(range.minimum), decimalPlaces(range.step)));
    return Math.min(range.maximum, Math.max(range.minimum, Number(snapped.toFixed(precision))));
}

function finiteNumber(value: unknown, fallback: number): number {
    if (value == null || (typeof value === "string" && value.trim() === "")) {
        return fallback;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function decimalPlaces(value: number): number {
    const [coefficient, exponentText] = Math.abs(value).toString().toLowerCase().split("e");
    return Math.max(0, (coefficient.split(".")[1]?.length || 0) - Number(exponentText || 0));
}

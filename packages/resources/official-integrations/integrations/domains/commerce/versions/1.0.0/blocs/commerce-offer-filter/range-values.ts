export function isRangeValue(value, minimum, maximum, step) {
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
        return false;
    }
    if (value === minimum || value === maximum) {
        return true;
    }
    const snapped = snapRangeValue(value, minimum, maximum, step, Number.NaN);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(snapped));
    return Number.isFinite(snapped) && Math.abs(value - snapped) <= tolerance;
}

export function snapRangeValue(value, minimum, maximum, step, fallback) {
    if (!Number.isFinite(value)) {
        return fallback;
    }
    const clamped = Math.min(maximum, Math.max(minimum, value));
    const snapped = minimum + Math.round((clamped - minimum) / step) * step;
    const bounded = Math.min(maximum, Math.max(minimum, snapped));
    const precision = rangePrecision(minimum, maximum, step);
    const normalized = precision <= 12 ? Number(bounded.toFixed(precision)) : Number(bounded.toPrecision(17));
    return Math.min(maximum, Math.max(minimum, normalized));
}

export function formatRangeValue(value, locale, precision) {
    if (precision > 12) {
        return String(value);
    }
    const options = { maximumFractionDigits: precision, useGrouping: false };
    try {
        return new Intl.NumberFormat(locale, options).format(value);
    } catch {
        return new Intl.NumberFormat(undefined, options).format(value);
    }
}

export function rangePrecision(...values) {
    return Math.min(20, Math.max(0, ...values.map(decimalPlaces)));
}

function decimalPlaces(value) {
    const [coefficient, exponentText] = Math.abs(value).toString().toLowerCase().split("e");
    const decimals = coefficient.split(".")[1]?.length ?? 0;
    return Math.max(0, decimals - Number(exponentText || 0));
}

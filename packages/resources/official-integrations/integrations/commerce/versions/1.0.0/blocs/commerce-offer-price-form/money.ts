export function majorToMinor(value) {
    const normalized = String(value).trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
        return NaN;
    }
    const [units, decimals = ""] = normalized.split(".");
    const amount = Number(units) * 100 + Number(decimals.padEnd(2, "0"));
    return Number.isSafeInteger(amount) ? amount : NaN;
}

export function minorToMajor(value) {
    return (Number(value) / 100).toFixed(2);
}

export function formatMoney(amount, currency, locale) {
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(currency || "EUR").toUpperCase(),
        }).format(Number(amount) / 100);
    } catch {
        return `${minorToMajor(amount)} ${String(currency || "EUR").toUpperCase()}`;
    }
}

export function majorToMinor(value) {
    const normalized = String(value).trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
        return NaN;
    }
    const [units, decimals = ""] = normalized.split(".");
    const amount = Number(units) * 100 + Number(decimals.padEnd(2, "0"));
    return Number.isSafeInteger(amount) ? amount : NaN;
}

export function minorToMajor(value, wholeUnitPrices = false) {
    return wholeUnitPrices ? String(Number(value) / 100) : (Number(value) / 100).toFixed(2);
}

export function formatMoney(amount, currency, locale, wholeUnitPrices = false) {
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(currency || "USD").toUpperCase(),
            minimumFractionDigits: wholeUnitPrices ? 0 : undefined,
            maximumFractionDigits: wholeUnitPrices ? 0 : undefined,
        }).format(Number(amount) / 100);
    } catch {
        return `${minorToMajor(amount, wholeUnitPrices)} ${String(currency || "USD").toUpperCase()}`;
    }
}

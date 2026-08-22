export function formatMoney(rawAmount, rawCurrency, rawLocale, wholeUnitPrices = false) {
    const amount = Number(rawAmount);
    const currency = rawCurrency?.trim().toUpperCase();
    if (!Number.isFinite(amount) || !currency) {
        return "";
    }
    if (wholeUnitPrices && amount % 100 !== 0) {
        return "";
    }
    const fractionDigits = amount % 100 === 0 ? 0 : 2;
    try {
        return new Intl.NumberFormat(rawLocale?.trim() || undefined, {
            style: "currency",
            currency,
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
        }).format(amount / 100);
    } catch {
        return `${(amount / 100).toFixed(fractionDigits)} ${currency}`;
    }
}

export function parseBooleanAttribute(value) {
    return value?.trim().toLowerCase() === "true";
}

export function formatMoney(root, locale) {
    for (const element of root.querySelectorAll("[data-sales-money]")) {
        const amount = element.getAttribute("data-amount-cents")?.trim() || "";
        const currency = element.getAttribute("data-currency")?.trim().toUpperCase() || "EUR";
        if (!amount || amount.includes("{{")) {
            continue;
        }
        const cents = Number(amount);
        if (!Number.isFinite(cents)) {
            continue;
        }
        let formatted;
        try {
            formatted = new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
        } catch {
            formatted = `${(cents / 100).toFixed(2)} ${currency}`;
        }
        if (element.textContent !== formatted) {
            element.textContent = formatted;
        }
    }
}

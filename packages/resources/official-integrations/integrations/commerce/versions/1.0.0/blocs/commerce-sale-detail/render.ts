import {
    conditionLabel,
    formatDate,
    formatMoney,
    platformShippingShareAmount,
    salePresentationStatus,
    sellerCommissionAmount,
    sellerMerchandiseAmount,
    sellerProceedsAmount,
    sellerShippingShareAmount,
    shippingAmount,
    variantLabel,
} from "./helpers";

export function renderSale(host, order) {
    host.setText("[data-order-number]", order.orderNumber || order.publicId || `Vente ${order.id}`);
    host.setText("[data-order-date]", `${host.text("date-prefix", "Vendue le")} ${formatDate(order.createdAt, host.locale)}`);
    const status = host.root.querySelector("[data-order-status]");
    const presentationStatus = salePresentationStatus(order);
    status.dataset.status = presentationStatus;
    status.textContent = host.statusLabel(presentationStatus);
    const lines = Array.isArray(order.lines) ? order.lines : [];
    host.root.querySelector("[data-lines]").replaceChildren(...lines.map(line => renderLine(host, line, order.currency)));
    const currency = order.financialTerms?.currency || order.currency;
    host.setText("[data-subtotal]", formatMoney(sellerMerchandiseAmount(order), currency, host.locale));
    const commission = sellerCommissionAmount(order);
    host.setText("[data-commission]", formatMoney(commission === 0 ? 0 : -commission, currency, host.locale));
    host.setText("[data-shipping]", sellerShippingValue(host, order, currency));
    host.setText("[data-total]", formatMoney(
        sellerProceedsAmount(order),
        currency,
        host.locale,
    ));
}

function sellerShippingValue(host, order, currency) {
    const total = shippingAmount(order);
    const sellerShare = sellerShippingShareAmount(order);
    const platformShare = platformShippingShareAmount(order);
    if (![total, sellerShare, platformShare].every(Number.isSafeInteger)) return "—";
    if (sellerShare + platformShare !== total) return "—";
    if (sellerShare > 0) return formatMoney(sellerShare, currency, host.locale, "always");
    if (total === 0) return formatMoney(0, currency, host.locale);
    if (platformShare === total) return host.text("platform-shipping-label", "Prise en charge par Courtside");
    return "—";
}

function renderLine(host, line, currency) {
    const row = document.createElement("article");
    row.className = "sale-line";
    const copy = document.createElement("div");
    copy.className = "line-copy";
    const title = document.createElement("strong");
    title.textContent = line.title || line.offerSnapshot?.title || host.text("fallback-article-label", "Article");
    const details = [
        variantLabel(line.variantSnapshot),
        line.quantity > 1 ? `${host.text("quantity-label", "Quantité")} : ${line.quantity}` : "",
        line.offerSnapshot?.conditionCode ? conditionLabel(line.offerSnapshot.conditionCode) : "",
    ].filter(Boolean);
    const meta = document.createElement("span");
    meta.className = "line-meta";
    meta.textContent = details.join(" · ");
    meta.hidden = !details.length;
    const price = document.createElement("strong");
    price.className = "line-price";
    price.textContent = formatMoney(line.totalAmount, currency, host.locale);
    copy.append(title, meta);
    row.append(copy, price);
    return row;
}

export function copyColors(host, target, prefix) {
    for (const name of ["text-color", "background-color", "border-color", "accent-color"]) {
        const value = host.getAttribute(`${prefix}-${name}`)?.trim();
        if (value) target.setAttribute(name, value);
        else target.removeAttribute(name);
    }
}

import { formatDate, formatMoney, saleDetailUrl } from "./helpers";

export function renderSale(host, sale) {
    const card = document.createElement("basic-card");
    card.setAttribute("appearance", host.getAttribute("card-appearance") || "outlined");
    card.setAttribute("density", "compact");
    copyColors(host, card, "card");

    const row = document.createElement("div");
    row.className = "sale-row";
    const identity = document.createElement("div");
    identity.className = "sale-identity";
    const number = document.createElement("strong");
    number.className = "sale-number";
    number.textContent = sale.orderNumber || sale.publicId || `Vente ${sale.id}`;
    const date = document.createElement("small");
    date.className = "sale-date";
    date.textContent = `${host.getAttribute("date-prefix") || "Vendue le"} ${formatDate(sale.createdAt, host.locale)}`;
    identity.append(number, date);

    const status = document.createElement("span");
    status.className = "sale-status";
    status.dataset.status = String(sale.status || "unknown");
    status.textContent = host.statusLabel(sale.status);
    const total = document.createElement("strong");
    total.className = "sale-total";
    total.textContent = formatMoney(sale.totalAmount, sale.currency, host.locale);

    const action = document.createElement("basic-button");
    action.setAttribute("action", "link");
    action.setAttribute("appearance", host.getAttribute("button-appearance") || "outlined");
    action.setAttribute("size", "sm");
    action.setAttribute("href", saleDetailUrl(host.detailUrl, sale, host.detailParam));
    action.textContent = host.getAttribute("detail-label") || "Voir la vente";
    copyColors(host, action, "button");
    row.append(identity, status, total, action);
    card.append(row);
    return card;
}

export function copyColors(host, target, prefix) {
    for (const name of ["text-color", "background-color", "border-color", "accent-color"]) {
        const value = host.getAttribute(`${prefix}-${name}`)?.trim();
        if (value) target.setAttribute(name, value);
        else target.removeAttribute(name);
    }
}

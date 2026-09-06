// Controller dependencies stay below the artifact root so installation can bundle them.
export const statusCodes = [
    "all",
    "draft",
    "action_required",
    "under_review",
    "online",
    "paused",
    "rejected",
    "archived",
];

export const statusDefaults = {
    all: "All",
    draft: "Drafts",
    action_required: "Action required",
    under_review: "Under review",
    online: "Online",
    paused: "Paused",
    rejected: "Rejected",
    archived: "Archived",
};

export function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function positiveIdentifier(value) {
    const identifier = String(value ?? "").trim();
    return /^[1-9]\d*$/.test(identifier) ? identifier : "";
}

export function setAttributeIfChanged(element, name, value) {
    if (element && element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

export function setTextIfChanged(element, value) {
    if (element && element.textContent !== value) {
        element.textContent = value;
    }
}

export function formatMoney(amount, currency, locale, pendingLabel = "Price pending") {
    if (amount === null || amount === undefined || String(amount).trim() === "") {
        return pendingLabel;
    }
    const value = Number(amount);
    if (!Number.isSafeInteger(value)) {
        return pendingLabel;
    }
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(currency || "USD").toUpperCase(),
        }).format(value / 100);
    } catch {
        return `${(value / 100).toFixed(2)} ${String(currency || "USD").toUpperCase()}`;
    }
}

export function formatDate(value, locale, template = "Updated on {date}") {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return template.replaceAll("{date}", new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date));
}

export function offerUrl(base, id, slug = "") {
    const hasPlaceholder = base.includes("{id}") || base.includes("{slug}");
    if (hasPlaceholder) {
        return base
            .replaceAll("{id}", encodeURIComponent(id || ""))
            .replaceAll("{slug}", encodeURIComponent(slug || ""));
    }
    const url = new URL(base, "https://cms.invalid");
    if (id) {
        url.searchParams.set("id", id);
    }
    return `${url.pathname}${url.search}${url.hash}`;
}

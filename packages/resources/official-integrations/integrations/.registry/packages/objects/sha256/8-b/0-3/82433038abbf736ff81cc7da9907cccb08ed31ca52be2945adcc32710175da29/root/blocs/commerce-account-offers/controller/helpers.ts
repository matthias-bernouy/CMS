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
    all: "Toutes",
    draft: "Brouillons",
    action_required: "Action requise",
    under_review: "En validation",
    online: "En ligne",
    paused: "En pause",
    rejected: "Refusées",
    archived: "Archivées",
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

export function copyOptionalAttribute(source, target, name, targetName = name) {
    if (!target) {
        return;
    }
    const value = source.getAttribute(name)?.trim();
    if (value) {
        target.setAttribute(targetName, value);
    } else {
        target.removeAttribute(targetName);
    }
}

export function copyColorAttributes(source, target, prefix) {
    if (!target) {
        return;
    }
    for (const name of ["text-color", "background-color", "border-color", "accent-color"]) {
        copyOptionalAttribute(source, target, `${prefix}-${name}`, name);
    }
}

export function formatMoney(amount, currency, locale) {
    if (amount === null || amount === undefined || String(amount).trim() === "") {
        return "Prix à définir";
    }
    const value = Number(amount);
    if (!Number.isSafeInteger(value)) {
        return "Prix à définir";
    }
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: String(currency || "EUR").toUpperCase(),
        }).format(value / 100);
    } catch {
        return `${(value / 100).toFixed(2)} ${String(currency || "EUR").toUpperCase()}`;
    }
}

export function formatDate(value, locale) {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return `Modifiée le ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)}`;
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

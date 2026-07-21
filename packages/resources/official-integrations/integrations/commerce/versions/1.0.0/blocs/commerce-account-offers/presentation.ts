import {
    copyColorAttributes,
    copyOptionalAttribute,
    formatDate,
    formatMoney,
    offerUrl,
    positiveIdentifier,
    setAttributeIfChanged,
    setTextIfChanged,
} from "./helpers";

export function syncPresentation(host, pageSize) {
    const filter = host.querySelector("[data-status-filter]");
    filter?.removeAttribute("label");
    setAttributeIfChanged(filter, "accessible-label", host.getAttribute("status-label") || "Filtrer par statut");
    setAttributeIfChanged(filter, "value", host.status);
    copyColorAttributes(host, filter, "field");
    for (const option of filter?.querySelectorAll("basic-option") ?? []) {
        setTextIfChanged(option, host.statusLabel(option.getAttribute("value")));
    }

    const createButton = host.querySelector("[data-create-button]");
    setTextIfChanged(createButton, host.getAttribute("create-label") || "Déposer une annonce");
    setAttributeIfChanged(createButton, "href", host.getAttribute("create-url") || "/deposer-une-annonce");
    copyColorAttributes(host, createButton, "button");

    copyOptionalAttribute(host, host.querySelector("[data-offers-layout]"), "text-color");
    const grid = host.querySelector("[data-offers-grid]");
    setAttributeIfChanged(grid, "min", host.getAttribute("grid-min") || "md");
    setAttributeIfChanged(grid, "max", host.getAttribute("grid-max") || "xl");
    setAttributeIfChanged(grid, "gap", host.getAttribute("grid-gap") || "md");
    setAttributeIfChanged(grid, "packing", host.getAttribute("grid-packing") || "fit");

    const pagination = host.querySelector("[data-pagination]");
    setAttributeIfChanged(pagination, "page", String(host.page));
    setAttributeIfChanged(pagination, "page-size", String(pageSize));
    copyOptionalAttribute(host, pagination, "button-accent-color", "accent-color");
    copyOptionalAttribute(host, pagination, "button-background-color");
    copyOptionalAttribute(host, pagination, "button-border-color");
    copyOptionalAttribute(host, pagination, "button-text-color");
    copyOptionalAttribute(host, pagination, "text-color");

    const errorToast = host.querySelector("[data-error-toast]");
    setTextIfChanged(errorToast, host.getAttribute("error-message") || "Impossible de charger vos annonces.");
}

export function syncRenderedOffers(host) {
    const locale = host.getAttribute("locale") || "fr-FR";
    for (const card of host.querySelectorAll("[data-offer-card]")) {
        copyColorAttributes(host, card, "card");
        card.toggleAttribute("stretch", host.getAttribute("card-stretch") !== "false");
        const image = card.querySelector("[data-offer-image]");
        const mediaId = positiveIdentifier(image?.getAttribute("data-media-id"));
        image?.toggleAttribute("hidden", host.getAttribute("show-image") === "false" || !mediaId);
        if (image) {
            image.style.width = "100%";
            image.style.height = host.getAttribute("image-height") || "12rem";
            image.style.objectFit = host.getAttribute("image-fit") || "cover";
        }
        if (image && mediaId) {
            setAttributeIfChanged(image, "src", `${host.sourceBase}/myOfferImage?id=${encodeURIComponent(mediaId)}`);
        } else {
            image?.removeAttribute("src");
        }

        const price = card.querySelector("[data-offer-price]");
        price?.toggleAttribute("hidden", host.getAttribute("show-price") === "false");
        if (price) {
            setTextIfChanged(price, formatMoney(price.dataset.displayAmount, price.dataset.currency, locale));
        }

        const status = card.querySelector("[data-offer-status]");
        status?.toggleAttribute("hidden", host.getAttribute("show-status") === "false");
        if (status) {
            setTextIfChanged(status, host.statusLabel(status.getAttribute("data-offer-status")));
        }

        const updated = card.querySelector("[data-offer-updated]");
        updated?.toggleAttribute("hidden", host.getAttribute("show-updated-at") === "false");
        if (updated) {
            setTextIfChanged(updated, formatDate(updated.dataset.date, locale));
        }

        const edit = card.querySelector("[data-edit-button]");
        const action = host.offerAction(edit.dataset.workflowState);
        setTextIfChanged(edit, action.label);
        setAttributeIfChanged(edit, "href", offerUrl(action.url, edit.dataset.offerId, edit.dataset.offerSlug));
        copyColorAttributes(host, edit, "button");
    }

    copyColorAttributes(host, host.querySelector("[data-empty-state]"), "card");
    const isUnfiltered = host.status === "all";
    setTextIfChanged(
        host.querySelector("[data-empty-title]"),
        isUnfiltered
            ? host.getAttribute("empty-title") || "Aucune annonce pour le moment"
            : host.getAttribute("empty-filtered-title") || "Aucune annonce avec ce statut",
    );
    setTextIfChanged(
        host.querySelector("[data-empty-message]"),
        isUnfiltered
            ? host.getAttribute("empty-message") || "Créez votre première annonce pour commencer à vendre."
            : host.getAttribute("empty-filtered-message") || "Essayez un autre statut pour retrouver vos annonces.",
    );
}

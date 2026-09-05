import {
    formatDate,
    formatMoney,
    offerUrl,
    positiveIdentifier,
    setAttributeIfChanged,
    setTextIfChanged,
} from "./helpers";

// Presentation helpers stay below the artifact root so installation can bundle them.

export function syncPresentation(host, pageSize) {
    const filter = host.querySelector("[data-status-filter]");
    filter?.removeAttribute("label");
    setAttributeIfChanged(filter, "accessible-label", host.getAttribute("status-label") || "Filter by status");
    setAttributeIfChanged(filter, "value", host.status);
    for (const option of filter?.querySelectorAll("mossa-option") ?? []) {
        setTextIfChanged(option, host.statusLabel(option.getAttribute("value")));
    }

    const createButton = host.querySelector("[data-create-button]");
    setTextIfChanged(createButton, host.getAttribute("create-label") || "Create an offer");
    const createUrl = host.getAttribute("create-url")?.trim() || "";
    createButton?.closest("mossa-button")?.toggleAttribute("hidden", !createUrl);
    if (createUrl) {
        setAttributeIfChanged(createButton, "href", createUrl);
    } else {
        createButton?.removeAttribute("href");
    }
    const grid = host.querySelector("[data-offers-grid]");
    setAttributeIfChanged(grid, "min", host.getAttribute("grid-min") || "md");
    setAttributeIfChanged(grid, "max", host.getAttribute("grid-max") || "xl");
    setAttributeIfChanged(grid, "gap", host.getAttribute("grid-gap") || "md");
    setAttributeIfChanged(grid, "packing", host.getAttribute("grid-packing") || "fit");

    const pagination = host.querySelector("[data-pagination]");
    setAttributeIfChanged(pagination, "page", String(host.page));
    setAttributeIfChanged(pagination, "page-size", String(pageSize));
    const errorToast = host.querySelector("[data-error-toast]");
    setTextIfChanged(errorToast, host.getAttribute("error-message") || "Unable to load your offers.");
}

export function syncRenderedOffers(host) {
    const locale = host.getAttribute("locale") || "en-US";
    for (const card of host.querySelectorAll("[data-offer-card]")) {
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
            setAttributeIfChanged(
                image,
                "data-cms-src",
                `/.cms/sources/commerce/myOfferImage?id=${encodeURIComponent(mediaId)}`,
            );
        } else {
            image?.removeAttribute("data-cms-src");
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
        const action = host.offerAction(edit.dataset.workflowState, edit.dataset.publiclyVisible === "true");
        edit?.toggleAttribute("hidden", !action);
        if (!action) {
            edit?.removeAttribute("href");
            continue;
        }
        setTextIfChanged(edit, action.label);
        setAttributeIfChanged(edit, "href", offerUrl(action.url, edit.dataset.offerId, edit.dataset.offerSlug));
    }

    const isUnfiltered = host.status === "all";
    setTextIfChanged(
        host.querySelector("[data-empty-title]"),
        isUnfiltered
            ? host.getAttribute("empty-title") || "No offers yet"
            : host.getAttribute("empty-filtered-title") || "No offers with this status",
    );
    setTextIfChanged(
        host.querySelector("[data-empty-message]"),
        isUnfiltered
            ? host.getAttribute("empty-message") || "Create your first offer to start selling."
            : host.getAttribute("empty-filtered-message") || "Try another status to find your offers.",
    );
}

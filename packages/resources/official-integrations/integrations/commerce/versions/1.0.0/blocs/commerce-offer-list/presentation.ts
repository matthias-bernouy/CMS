import { setAttributeIfChanged } from "./helpers";

export function syncOfferListPresentation(host) {
    for (const grid of host.querySelectorAll("[data-offers-grid]")) {
        setAttributeIfChanged(grid, "min", host.getAttribute("grid-min") || "md");
        setAttributeIfChanged(grid, "max", host.getAttribute("grid-max") || "xl");
        setAttributeIfChanged(grid, "gap", host.getAttribute("grid-gap") || "md");
        setAttributeIfChanged(grid, "packing", host.getAttribute("grid-packing") || "fit");
        setAttributeIfChanged(grid, "justify-items", "stretch");
    }

    const stretch = host.getAttribute("card-stretch") !== "false";
    for (const card of host.querySelectorAll("[data-offer-card]")) {
        card.toggleAttribute("stretch", stretch);
    }
}

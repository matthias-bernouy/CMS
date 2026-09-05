import { setAttributeIfChanged } from "./helpers";

export function syncOfferListPresentation(host) {
    for (const grid of host.querySelectorAll("[data-offers-grid]")) {
        setAttributeIfChanged(grid, "min", host.getAttribute("grid-min") || "md");
        setAttributeIfChanged(grid, "max", host.getAttribute("grid-max") || "lg");
        setAttributeIfChanged(grid, "gap", host.getAttribute("grid-gap") || "md");
        setAttributeIfChanged(grid, "packing", host.getAttribute("grid-packing") || "fill");
        setAttributeIfChanged(grid, "justify-items", "stretch");
    }

    const stretch = host.getAttribute("card-stretch") !== "false";
    const offerUrl = host.getAttribute("offer-url")?.trim() || "";
    const locale = host.getAttribute("locale")?.trim() || "en-US";
    for (const card of host.querySelectorAll("[data-offer-card]")) {
        card.toggleAttribute("stretch", stretch);
        setAttributeIfChanged(card, "locale", locale);
        const link = card.querySelector("[data-offer-link]");
        const slug = link?.getAttribute("data-offer-slug") || "";
        if (offerUrl && slug) {
            setAttributeIfChanged(link, "href", offerUrl.replaceAll("{slug}", encodeURIComponent(slug)));
        } else {
            link?.removeAttribute("href");
        }
    }
}

type ObjectValue = Record<string, unknown>;
type OfferAction = { label: string; url: string } | null;

const statusCodes = ["all", "draft", "action_required", "under_review", "online", "paused", "rejected", "archived"];

export const presentationAttributes = [
    "edit-label",
    "edit-url",
    "empty-filtered-message",
    "empty-filtered-title",
    "empty-message",
    "empty-title",
    "error-message",
    "card-layout",
    "grid-gap",
    "grid-max",
    "grid-min",
    "grid-packing",
    "pending-price-label",
    "price-label",
    "price-url",
    "show-image",
    "show-price",
    "show-status",
    "show-updated-at",
    "updated-on-template",
    "view-label",
    "view-url",
    ...statusCodes.map((status) => `label-${status.replaceAll("_", "-")}`),
];

export function offerListPresentation(
    host: HTMLElement,
    value: unknown,
    offset: number,
    status: string,
): Record<string, unknown> {
    const response = objectValue(value) || {};
    const unfiltered = status === "all" || !status;
    return {
        emptyMessage: text(
            host,
            unfiltered ? "empty-message" : "empty-filtered-message",
            unfiltered ? "Create your first offer to start selling." : "Try another status to find your offers.",
        ),
        emptyTitle: text(
            host,
            unfiltered ? "empty-title" : "empty-filtered-title",
            unfiltered ? "No offers yet" : "No offers with this status",
        ),
        errorMessage: text(host, "error-message", "Your offers could not be loaded."),
        cardLayout: text(host, "card-layout", "vertical"),
        gridGap: text(host, "grid-gap", "md"),
        gridMax: text(host, "grid-max", "xl"),
        gridMin: text(host, "grid-min", "md"),
        gridPacking: text(host, "grid-packing", "fit"),
        items: objectValues(response.items).map((offer) => projectOffer(host, offer)),
        page: Math.floor(offset / 12) + 1,
        showImage: host.getAttribute("show-image") !== "false",
        showPrice: host.getAttribute("show-price") !== "false",
        showStatus: host.getAttribute("show-status") !== "false",
        showUpdatedAt: host.getAttribute("show-updated-at") !== "false",
        total: nonNegativeInteger(response.total),
    };
}

function projectOffer(host: HTMLElement, offer: ObjectValue): Record<string, unknown> {
    const action = offerAction(host, offer);
    const amount = minorAmount(offer.sellerDisplayPriceAmount);
    return {
        ...offer,
        actionLabel: action?.label || "",
        actionUrl: action?.url || "",
        hasPrice: amount !== null,
        imageUrl: positiveIdentifier(offer.mainImageMediaId)
            ? `/.cms/sources/commerce/myOfferImage?id=${encodeURIComponent(String(offer.mainImageMediaId))}`
            : "",
        pendingPriceLabel: text(host, "pending-price-label", "Price pending"),
        showPendingPrice: amount === null && offer.workflowState === "awaiting_seller_price",
        sellerDisplayPriceAmount: amount,
        statusLabel: statusLabel(host, String(offer.displayStatus || "draft")),
        statusTone: statusTone(String(offer.displayStatus || "draft")),
        updatedLabel: updatedLabel(host, offer.updatedAt),
    };
}

function offerAction(host: HTMLElement, offer: ObjectValue): OfferAction {
    const workflow = String(offer.workflowState || "");
    if (workflow === "awaiting_seller_price") {
        return action(host, offer, "price-url", "price-label", "Set my price");
    }
    if (["draft", "changes_requested"].includes(workflow)) {
        return action(host, offer, "edit-url", "edit-label", "Edit");
    }
    if (!offer.publiclyVisible) {
        return null;
    }
    return action(host, offer, host.hasAttribute("view-url") ? "view-url" : "edit-url", "view-label", "View");
}

function action(host: HTMLElement, offer: ObjectValue, urlAttribute: string, labelAttribute: string, fallback: string) {
    const template = host.getAttribute(urlAttribute)?.trim() || "";
    return template
        ? {
              label: text(host, labelAttribute, fallback),
              url: offerUrl(template, String(offer.id || ""), String(offer.slug || "")),
          }
        : null;
}

function statusLabel(host: HTMLElement, status: string): string {
    const code = statusCodes.includes(status) ? status : "draft";
    return text(host, `label-${code.replaceAll("_", "-")}`, statusDefaults[code]);
}

function statusTone(status: string): string {
    if (status === "online") {
        return "success";
    }
    if (status === "rejected") {
        return "danger";
    }
    if (status === "action_required") {
        return "warning";
    }
    return status === "under_review" ? "secondary" : "neutral";
}

function updatedLabel(host: HTMLElement, value: unknown): string {
    const date = new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const locale =
        host.ownerDocument.documentElement.lang || host.ownerDocument.defaultView?.navigator.language || "en-US";
    const formatted = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
    return text(host, "updated-on-template", "Updated on {date}").replaceAll("{date}", formatted);
}

function offerUrl(base: string, id: string, slug: string): string {
    if (base.includes("{id}") || base.includes("{slug}")) {
        return base.replaceAll("{id}", encodeURIComponent(id)).replaceAll("{slug}", encodeURIComponent(slug));
    }
    const url = new URL(base, "https://cms.invalid");
    if (id) {
        url.searchParams.set("id", id);
    }
    return `${url.pathname}${url.search}${url.hash}`;
}

const statusDefaults: Record<string, string> = {
    all: "All",
    draft: "Drafts",
    action_required: "Action required",
    under_review: "Under review",
    online: "Online",
    paused: "Paused",
    rejected: "Rejected",
    archived: "Archived",
};

function text(host: HTMLElement, attribute: string, fallback: string): string {
    return host.getAttribute(attribute)?.trim() || fallback;
}

function objectValue(value: unknown): ObjectValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : null;
}

function objectValues(value: unknown): ObjectValue[] {
    return Array.isArray(value) ? value.map(objectValue).filter((item): item is ObjectValue => item !== null) : [];
}

function minorAmount(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function nonNegativeInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function positiveIdentifier(value: unknown): boolean {
    return /^[1-9]\d*$/.test(String(value ?? "").trim());
}

type Value = Record<string, unknown>;

const statusLabels: Record<string, string> = {
    pending: "Pending",
    accepted: "Accepted",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
    expired: "Expired",
    superseded: "Superseded",
    canceled: "Cancelled",
};

export const presentationAttributes = [
    "title",
    "copy",
    "combined-label",
    "received-label",
    "sent-label",
    "received-direction-label",
    "sent-direction-label",
    "status-label",
    "proposed-label",
    "reference-label",
    "accept-label",
    "reject-label",
    "withdraw-label",
    "checkout-label-template",
    "checkout-expiration-label",
    "decision-label-template",
    "expiration-label",
    "order-label",
    "empty-title",
    "empty-message",
    "empty-filtered-title",
    "empty-filtered-message",
    "error-message",
    "error-title",
    "image-unavailable-label",
    "loading-label",
    "offer-link-template",
    "role-label",
    "offer-url",
    "checkout-url",
    "order-url",
    "grid-min",
    "grid-max",
    "grid-gap",
    "grid-packing",
    "card-appearance",
    "card-density",
    "card-layout",
    "show-header",
    "show-role-tabs",
    "show-reference-price",
    "show-message",
    "show-expiration",
    "pagination-previous-label",
    "pagination-next-label",
    "pagination-summary-template",
    "pagination-tone",
    ...Object.keys(statusLabels).flatMap((status) => [`label-${status}`, `filter-label-${status}`]),
    "filter-label-all",
];

export function negotiationListPresentation(
    host: HTMLElement,
    value: unknown,
    offset: number,
    filtered: boolean,
): Value {
    const source = record(value) || {};
    const text = (attribute: string, fallback: string): string => host.getAttribute(attribute)?.trim() || fallback;
    const items = Array.isArray(source.items)
        ? source.items.filter(record).map((item) => projectItem(host, item, text))
        : [];
    return {
        acceptLabel: text("accept-label", "Accept"),
        allLabel: text("filter-label-all", "All"),
        cardAppearance: text("card-appearance", "outlined"),
        cardDensity: text("card-density", "compact"),
        cardLayout: text("card-layout", "vertical"),
        combinedLabel: text("combined-label", "All"),
        copy: text("copy", "Review received and sent proposals."),
        emptyMessage: filtered
            ? text("empty-filtered-message", "Try another status to find your proposals.")
            : text("empty-message", "Received and sent proposals will appear here."),
        emptyTitle: filtered
            ? text("empty-filtered-title", "No proposal with this status")
            : text("empty-title", "No proposals yet"),
        errorMessage: text("error-message", "Proposals could not be loaded."),
        errorTitle: text("error-title", "Proposals unavailable"),
        gridGap: text("grid-gap", "md"),
        gridMax: text("grid-max", "xl"),
        gridMin: text("grid-min", "md"),
        gridPacking: text("grid-packing", "fit"),
        items,
        imageUnavailableLabel: text("image-unavailable-label", "No photo available"),
        loadingLabel: text("loading-label", "Loading proposals"),
        page: Math.floor(offset / 12) + 1,
        paginationNextLabel: text("pagination-next-label", "Next"),
        paginationPreviousLabel: text("pagination-previous-label", "Previous"),
        paginationSummaryTemplate: text("pagination-summary-template", "Page {page} of {pages}"),
        paginationTone: text("pagination-tone", "primary"),
        proposedLabel: text("proposed-label", "Proposed price"),
        receivedLabel: text("received-label", "Received proposals"),
        referenceLabel: text("reference-label", "Initial price"),
        rejectLabel: text("reject-label", "Reject"),
        sentLabel: text("sent-label", "Sent proposals"),
        showHeader: host.getAttribute("show-header") !== "false",
        showMessage: host.getAttribute("show-message") !== "false",
        showExpiration: host.getAttribute("show-expiration") !== "false",
        showReferencePrice: host.getAttribute("show-reference-price") !== "false",
        showRoleTabs: host.getAttribute("show-role-tabs") !== "false",
        roleLabel: text("role-label", "Proposal type"),
        statusFilterLabel: text("status-label", "Filter by status"),
        statusOptions: ["pending", "accepted", "rejected", "withdrawn", "expired", "superseded", "canceled"].map(
            (status) => ({ label: text(`filter-label-${status}`, statusLabels[status]), value: status }),
        ),
        title: text("title", "My proposals"),
        total: nonNegativeInteger(source.total, items.length),
        withdrawLabel: text("withdraw-label", "Withdraw"),
    };
}

function projectItem(host: HTMLElement, item: Value, text: (attribute: string, fallback: string) => string): Value {
    const status = String(item.status || "pending");
    const viewerRole = String(item.viewerRole || "");
    return {
        ...item,
        checkoutLabel: text("checkout-label-template", "Complete purchase").replaceAll(
            "{amount}",
            formatMoney(item.proposedAmount, item.currency, host),
        ),
        checkoutExpirationLabel: formatCopy(
            text("checkout-expiration-label", "Payment available until {date}"),
            status,
            item.checkoutExpiresAt,
            host,
        ),
        checkoutUrl: routeUrl(host.getAttribute("checkout-url"), "agreementId", item.agreementId),
        directionLabel: text(
            viewerRole === "seller" ? "received-direction-label" : "sent-direction-label",
            viewerRole === "seller" ? "Received proposal" : "Sent proposal",
        ),
        expirationLabel: formatCopy(text("expiration-label", "Expires on {date}"), status, item.expiresAt, host),
        offerUrl: routeUrl(host.getAttribute("offer-url"), "slug", item.offerSlug),
        offerLinkLabel: text("offer-link-template", "View {title}").replaceAll(
            "{title}",
            String(item.offerTitle || ""),
        ),
        orderLabel: text("order-label", "View my order"),
        orderUrl: routeUrl(host.getAttribute("order-url"), "orderId", item.orderId),
        decisionLabel: formatCopy(
            text("decision-label-template", "{status} on {date}"),
            text(`label-${status}`, statusLabels[status] || status),
            item.acceptedAt || item.rejectedAt || item.withdrawnAt,
            host,
        ),
        statusLabel: text(`label-${status}`, statusLabels[status] || status),
        statusTone: status === "accepted" ? "success" : status === "rejected" ? "danger" : "neutral",
    };
}

function formatMoney(amount: unknown, currency: unknown, host: HTMLElement): string {
    const value = Number(amount);
    if (!Number.isSafeInteger(value)) {
        return "";
    }
    try {
        return new Intl.NumberFormat(
            host.ownerDocument.documentElement.lang || host.ownerDocument.defaultView?.navigator.language || "en-US",
            { style: "currency", currency: String(currency || "USD").toUpperCase() },
        ).format(value / 100);
    } catch {
        return String(value / 100);
    }
}

function formatCopy(template: string, status: string, value: unknown, host: HTMLElement): string {
    const date = new Date(String(value || ""));
    const formatted = Number.isNaN(date.getTime())
        ? ""
        : new Intl.DateTimeFormat(
              host.ownerDocument.documentElement.lang || host.ownerDocument.defaultView?.navigator.language || "en-US",
              {
                  dateStyle: "long",
              },
          ).format(date);
    return template.replaceAll("{status}", status).replaceAll("{date}", formatted).trim();
}

function routeUrl(base: string | null, parameter: string, rawValue: unknown): string {
    const value = String(rawValue || "").trim();
    if (!base?.trim() || !value) {
        return "";
    }
    const url = new URL(base, "http://mossa.invalid");
    url.searchParams.set(parameter, value);
    return url.origin === "http://mossa.invalid" ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function record(value: unknown): Value | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Value) : null;
}

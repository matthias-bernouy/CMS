import { Component } from "@bernouy/components/base";
import { refreshSourceContext, setSourceContext } from "@bernouy/components/binding";
import { saleStatus } from "./status";

type ObjectValue = Record<string, unknown>;

const statuses = [
    "awaiting_quote",
    "awaiting_payment",
    "active",
    "completed",
    "cancellation_pending",
    "cancelled",
    "expired",
] as const;

const defaults: Record<string, string> = {
    active: "To ship",
    arrived_at_pickup_point: "Arrived at pickup point",
    awaiting_payment: "Payment pending",
    awaiting_quote: "Delivery to complete",
    awaiting_shipment: "To ship",
    available_for_pickup: "Available for pickup",
    carrier_accepted: "Accepted by carrier",
    cancellation_pending: "Cancellation in progress",
    cancelled: "Cancelled",
    collected_by_recipient: "Delivered",
    completed: "Completed",
    dispute_in_progress: "Dispute in progress",
    expired: "Expired",
    incident: "Delivery incident",
    in_transit: "In transit",
    label_created: "Shipping label ready",
    lost: "Parcel lost",
    pickup_expired: "Pickup expired",
    refund_in_progress: "Refund in progress",
    refunded: "Refunded",
    returning_to_sender: "Return in progress",
    returned_to_sender: "Returned to seller",
    review_required: "Review required",
    seller_handoff_declared: "Handoff declared",
    shipment_creating: "Creating shipping label",
};

const projectedStatuses = Object.keys(defaults);

const copyAttributes = [
    "empty-message",
    "empty-title",
    "error-message",
    "items-label",
    "label-all",
    "loading-label",
    "pagination-next-label",
    "pagination-previous-label",
    "pagination-summary-template",
    "pagination-tone",
    "sale-amount-label",
    "sale-action-label",
    "sold-on-label",
    "status-label",
    ...projectedStatuses.map((status) => `label-${status}`),
];

const presentationAttributes = [
    ...copyAttributes,
    "grid-gap",
    "grid-max",
    "grid-min",
    "grid-packing",
    "show-order-reference",
    "show-status-filter",
];

export class CommerceAccountSalesController extends Component {
    static observedAttributes = [...presentationAttributes, "sale-url"];

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        setSourceContext(this.source, (value) => ({ presentation: this.presentation(value) }));
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("mossa-pagination:change", this.onPageChange as EventListener);
    }

    disconnectedCallback(): void {
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("mossa-pagination:change", this.onPageChange as EventListener);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            refreshSourceContext(this.source);
        }
    }

    private presentation(value: unknown): Record<string, unknown> {
        const response = objectValue(value) || {};
        return {
            emptyMessage: this.text("empty-message", "Buyer orders will appear here."),
            emptyTitle: this.text("empty-title", "No sales yet"),
            errorMessage: this.text("error-message", "Sales could not be loaded. Try again shortly."),
            gridGap: this.text("grid-gap", "sm"),
            gridMax: this.text("grid-max", "xl"),
            gridMin: this.text("grid-min", "xl"),
            gridPacking: this.text("grid-packing", "fit"),
            items: objectValues(response.items).map((sale) => this.sale(sale)),
            itemsLabel: this.text("items-label", "items"),
            labelAll: this.text("label-all", "All"),
            loadingLabel: this.text("loading-label", "Loading sales"),
            page: Math.floor(this.offset / 10) + 1,
            paginationNextLabel: this.text("pagination-next-label", "Next"),
            paginationPreviousLabel: this.text("pagination-previous-label", "Previous"),
            paginationSummaryTemplate: this.text("pagination-summary-template", "Page {page} of {pages}"),
            paginationTone: this.text("pagination-tone", "primary"),
            saleAmountLabel: this.text("sale-amount-label", "Sale amount"),
            showOrderReference: this.getAttribute("show-order-reference") === "true",
            showStatusFilter: this.getAttribute("show-status-filter") !== "false",
            soldOnLabel: this.text("sold-on-label", "Sold on"),
            statusLabel: this.text("status-label", "Filter sales by status"),
            statusOptions: statuses.map((status) => ({ label: this.statusLabel(status), value: status })),
            total: nonNegativeInteger(response.total),
        };
    }

    private sale(sale: ObjectValue): ObjectValue {
        const status = saleStatus(sale.status, objectValue(sale.operation));
        return {
            ...sale,
            actionLabel: this.text("sale-action-label", "View sale"),
            actionUrl: routeUrl(this.getAttribute("sale-url"), { saleId: sale.id }),
            displayAmount: minorAmount(sale.subtotalAmount) ?? minorAmount(sale.totalAmount),
            statusLabel: this.statusLabel(status),
            statusTone: statusTone(status),
        };
    }

    private statusLabel(status: string): string {
        return this.text(`label-${status}`, defaults[status] || status);
    }

    private text(attribute: string, fallback: string): string {
        return this.getAttribute(attribute)?.trim() || fallback;
    }

    private readonly onPageChange = (event: CustomEvent<{ offset?: number }>): void => {
        if (event.target instanceof Element && event.target.localName === "mossa-pagination") {
            this.setOffset(event.detail?.offset);
        }
    };

    private readonly onFilterChange = (event: Event): void => {
        if (event.target instanceof Element && event.target.matches('[cms-param-sync="commerceSalesStatus"]')) {
            this.setOffset(0);
        }
    };

    private setOffset(value: unknown): void {
        this.offsetControl.value = String(nonNegativeInteger(value));
        this.offsetControl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    private get source(): HTMLElement {
        return this.querySelector<HTMLElement>('[cms-source-id="sales"]')!;
    }

    private get offsetControl(): HTMLInputElement {
        return this.querySelector<HTMLInputElement>('[name="commerceSalesOffset"]')!;
    }

    private get offset(): number {
        return nonNegativeInteger(this.offsetControl.value);
    }
}

function objectValue(value: unknown): ObjectValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : null;
}

function objectValues(value: unknown): ObjectValue[] {
    return Array.isArray(value) ? value.map(objectValue).filter((item): item is ObjectValue => item !== null) : [];
}

function nonNegativeInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function minorAmount(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function routeUrl(template: string | null, values: Record<string, unknown>): string {
    return Object.entries(values).reduce(
        (result, [key, value]) => result.replaceAll(`{${key}}`, encodeURIComponent(String(value ?? ""))),
        template || "",
    );
}

function statusTone(status: string): string {
    if (["completed", "collected_by_recipient"].includes(status)) {
        return "success";
    }
    if (["cancelled", "expired", "incident", "lost", "review_required"].includes(status)) {
        return "danger";
    }
    if (
        [
            "awaiting_payment",
            "awaiting_quote",
            "cancellation_pending",
            "refund_in_progress",
            "dispute_in_progress",
        ].includes(status)
    ) {
        return "warning";
    }
    return ["refunded", "pickup_expired", "returning_to_sender", "returned_to_sender"].includes(status)
        ? "info"
        : "primary";
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceAccountSalesController);

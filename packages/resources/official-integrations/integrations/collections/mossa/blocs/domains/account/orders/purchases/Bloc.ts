import { Component } from "@bernouy/components/base";
import { purchaseCopy, purchaseLabels, purchaseText, syncPurchaseCopy } from "./copy";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type RecordValue = Record<string, any>;
type ViewState = "loading" | "content" | "empty" | "login" | "error";

class PurchaseRequestError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

export class PurchaseList extends Component {
    static observedAttributes = [
        "locale",
        "next-label",
        "order-action-label",
        "order-url",
        "page-param",
        "page-size",
        "previous-label",
        "pagination-previous-label",
        "pagination-next-label",
        ...Object.keys(purchaseCopy),
        ...Object.keys(purchaseLabels),
    ];

    private requestVersion = 0;
    private orders: RecordValue[] = [];
    private total = 0;
    private inFlightRequests = new Map<string, Promise<RecordValue>>();

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.previousButton.addEventListener("click", this.onPrevious);
        this.nextButton.addEventListener("click", this.onNext);
        this.view.addEventListener("popstate", this.onPopState);
        this.syncPresentation();
        this.load().catch((error) => this.fail(error));
    }

    disconnectedCallback(): void {
        this.previousButton.removeEventListener("click", this.onPrevious);
        this.nextButton.removeEventListener("click", this.onNext);
        this.view.removeEventListener("popstate", this.onPopState);
        this.inFlightRequests.clear();
        this.clearGeneratedActions();
    }

    attributeChangedCallback(name: string): void {
        if (!this.isConnected) {
            return;
        }
        this.syncPresentation();
        if (name === "page-size" || name === "page-param") {
            this.load().catch((error) => this.fail(error));
        }
    }

    private onPrevious = (): void => {
        this.goToPage(this.page - 1);
    };
    private onNext = (): void => {
        this.goToPage(this.page + 1);
    };
    private onPopState = (): void => {
        this.load().catch((error) => this.fail(error));
    };

    private async load(): Promise<void> {
        const version = ++this.requestVersion;
        this.clearGeneratedActions();
        this.show("loading");
        const page = this.page;
        const pageSize = this.pageSize;
        const requestPath = `/.cms/sources/commerce/myOrders?limit=${pageSize}&offset=${(page - 1) * pageSize}`;
        try {
            let pending = this.inFlightRequests.get(requestPath);
            if (!pending) {
                pending = this.request(requestPath).finally(() => {
                    if (this.inFlightRequests.get(requestPath) === pending) {
                        this.inFlightRequests.delete(requestPath);
                    }
                });
                this.inFlightRequests.set(requestPath, pending);
            }
            const data = await pending;
            if (version !== this.requestVersion) {
                return;
            }
            const total = nonNegativeInteger(data.total);
            const pageCount = Math.max(1, Math.ceil(total / pageSize));
            if (page > pageCount) {
                this.writePage(pageCount, true);
                await this.load();
                return;
            }
            const orders = Array.isArray(data.items) ? data.items : [];
            this.orders = orders;
            this.total = total;
            if (!orders.length && total === 0) {
                this.show("empty");
                return;
            }
            this.renderOrders();
            this.show("content");
        } catch (error) {
            if (version === this.requestVersion) {
                this.fail(error);
            }
        }
    }

    private renderOrders(): void {
        this.clearGeneratedActions();
        const renderedOrders = this.orders.map((order, index) => this.orderCard(order, index));
        this.list.replaceChildren(...renderedOrders.map(({ card }) => card));
        this.append(...renderedOrders.map(({ action }) => action));
        const page = this.page;
        const pages = Math.max(1, Math.ceil(this.total / this.pageSize));
        this.pageLabel.textContent = purchaseText(this, "pagination-summary-template", {
            page,
            pages,
            pageCount: pages,
            total: this.total,
            start: this.total ? (page - 1) * this.pageSize + 1 : 0,
            end: Math.min(page * this.pageSize, this.total),
        });
        this.previousButton.toggleAttribute("disabled", page <= 1);
        this.nextButton.toggleAttribute("disabled", page >= pages);
        this.pagination.hidden = pages <= 1;
    }

    private orderCard(order: RecordValue, index: number): { card: HTMLElement; action: HTMLElement } {
        const document = this.ownerDocument;
        const card = document.createElement("mossa-surface-card");
        card.setAttribute("appearance", "outlined");
        card.setAttribute("density", "compact");

        const row = document.createElement("div");
        row.className = "purchase-row";

        const identity = document.createElement("div");
        identity.className = "identity";
        const number = document.createElement("strong");
        number.className = "order-number";
        const reference = String(order.orderNumber || purchaseText(this, "order-reference-template", { id: order.id }));
        const summary = lineSummaryLabel(this, order);
        number.textContent = summary || reference;
        const date = document.createElement("span");
        date.className = "order-date";
        const datedAt = purchaseText(this, "placed-on-template", {
            date: formatDate(order.createdAt, this.locale, purchaseText(this, "unknown-date-label")),
        });
        date.textContent = summary ? `${reference} · ${datedAt}` : datedAt;
        identity.append(number, date);

        const status = document.createElement("span");
        const presentation = orderStatus(order);
        status.className = "status";
        status.dataset.tone = presentation.tone;
        status.textContent = purchaseText(this, `label-${presentation.key}`);

        const total = document.createElement("div");
        total.className = "amount";
        const totalLabel = document.createElement("span");
        totalLabel.textContent = purchaseText(this, "total-label");
        const totalValue = document.createElement("strong");
        totalValue.textContent = money(Number(order.totalAmount), order.currency, this.locale);
        total.append(totalLabel, totalValue);

        const linkWrapper = document.createElement("mossa-button");
        const actionSlot = document.createElement("slot");
        actionSlot.className = "purchase-action";
        actionSlot.name = `purchase-action-${index}`;
        linkWrapper.slot = actionSlot.name;
        linkWrapper.dataset.generatedPurchaseAction = "";
        linkWrapper.setAttribute("appearance", "outlined");
        linkWrapper.setAttribute("tone", "neutral");
        linkWrapper.setAttribute("size", "sm");
        linkWrapper.setAttribute("width", "full");
        const link = document.createElement("a");
        const orderUrl = this.getAttribute("order-url")?.trim() || "";
        linkWrapper.hidden = !orderUrl;
        if (orderUrl) {
            link.href = orderUrl.replaceAll("{orderId}", encodeURIComponent(String(order.id)));
        }
        link.textContent = this.getAttribute("order-action-label")?.trim() || "View order";
        linkWrapper.append(link);

        row.append(identity, status, total, actionSlot);
        card.append(row);
        return { action: linkWrapper, card };
    }

    private clearGeneratedActions(): void {
        for (const action of this.querySelectorAll(":scope > [data-generated-purchase-action]")) {
            action.remove();
        }
    }

    private goToPage(page: number): void {
        const nextPage = Math.max(1, Math.trunc(page));
        if (nextPage === this.page) {
            return;
        }
        this.writePage(nextPage, false);
        this.load().catch((error) => this.fail(error));
    }

    private writePage(page: number, replace: boolean): void {
        const url = new URL(this.view.location.href);
        if (page <= 1) {
            url.searchParams.delete(this.pageParam);
        } else {
            url.searchParams.set(this.pageParam, String(page));
        }
        const next = `${url.pathname}${url.search}`;
        if (replace) {
            this.view.history.replaceState(this.view.history.state, "", next);
        } else {
            this.view.history.pushState(this.view.history.state, "", next);
        }
    }

    private syncPresentation(): void {
        syncPurchaseCopy(this);
        this.previousButton.textContent =
            this.getAttribute("pagination-previous-label")?.trim() ||
            this.getAttribute("previous-label")?.trim() ||
            "Previous";
        this.nextButton.textContent =
            this.getAttribute("pagination-next-label")?.trim() || this.getAttribute("next-label")?.trim() || "Next";
        for (const button of this.pagination.querySelectorAll("mossa-button")) {
            button.setAttribute("tone", purchaseText(this, "pagination-tone"));
        }
        if (this.orders.length) {
            this.renderOrders();
        }
    }

    private async request(path: string): Promise<RecordValue> {
        const response = await fetch(path, { credentials: "include", headers: { accept: "application/json" } });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new PurchaseRequestError(response.status, responseMessage(body));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error();
        }
        return body;
    }

    private fail(error: unknown): void {
        if (error instanceof PurchaseRequestError && error.status === 401) {
            this.show("login");
            return;
        }
        this.show("error");
    }

    private show(state: ViewState): void {
        this.loading.hidden = state !== "loading";
        this.content.hidden = state !== "content";
        this.empty.hidden = state !== "empty";
        this.login.hidden = state !== "login";
        this.error.hidden = state !== "error";
    }

    private get page(): number {
        const value = Number(new URL(this.view.location.href).searchParams.get(this.pageParam) || 1);
        return Number.isSafeInteger(value) && value > 0 ? value : 1;
    }
    private get pageSize(): number {
        const value = Number(this.getAttribute("page-size") || 8);
        return Number.isSafeInteger(value) ? Math.min(50, Math.max(1, value)) : 8;
    }
    private get pageParam(): string {
        return this.getAttribute("page-param")?.trim() || "page";
    }
    private get view(): Window {
        return this.ownerDocument.defaultView || window;
    }
    private get loading() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-loading]")!;
    }
    private get locale(): string {
        return this.getAttribute("locale")?.trim() || "en-US";
    }
    private get content() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-content]")!;
    }
    private get empty() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-empty]")!;
    }
    private get login() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-login]")!;
    }
    private get error() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-error]")!;
    }
    private get list() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-list]")!;
    }
    private get pagination() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-pagination]")!;
    }
    private get pageLabel() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-page-label]")!;
    }
    private get previousButton() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-previous]")!;
    }
    private get nextButton() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-next]")!;
    }
}

function nonNegativeInteger(value: unknown): number {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
function money(amount: number, currency: unknown, locale: string): string {
    if (!Number.isSafeInteger(amount)) {
        return "—";
    }
    try {
        const currencyCode = String(currency || "USD").toUpperCase();
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currencyCode,
        }).format(amount / 100);
    } catch {
        return `${(amount / 100).toFixed(2)} ${String(currency || "USD").toUpperCase()}`;
    }
}
function formatDate(value: unknown, locale: string, unknownDate: string): string {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime())
        ? unknownDate
        : new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(parsed);
}
function lineSummaryLabel(host: HTMLElement, order: RecordValue): string {
    const summary = order?.lineSummary && typeof order.lineSummary === "object" ? order.lineSummary : {};
    const firstTitle = typeof summary.firstTitle === "string" ? summary.firstTitle.trim() : "";
    if (!firstTitle) {
        return "";
    }
    const lineCount = Number(summary.lineCount);
    return Number.isSafeInteger(lineCount) && lineCount > 1
        ? purchaseText(host, lineCount > 2 ? "other-items-template" : "other-item-template", {
              title: firstTitle,
              count: lineCount - 1,
          })
        : firstTitle;
}
function orderStatus(order: RecordValue): { key: string; tone: string } {
    const operation = order?.operation && typeof order.operation === "object" ? order.operation : {};
    const settlement = String(operation.settlementStatus || "").toLowerCase();
    const payment = String(operation.paymentStatus || "").toLowerCase();
    const claim = String(operation.claimStatus || "").toLowerCase();

    if (settlement === "manual_review" || settlement === "blocked") {
        return { key: "review-required", tone: "danger" };
    }
    if (claim && !["resolved_buyer", "resolved_seller", "resolved_split"].includes(claim)) {
        return { key: "dispute-in-progress", tone: "progress" };
    }
    if (["refund_pending", "reversal_pending"].includes(settlement)) {
        return { key: "refund-in-progress", tone: "progress" };
    }
    if (settlement === "refunded" || settlement === "reversed" || payment === "refunded") {
        return { key: "refunded", tone: "neutral" };
    }
    if (payment === "partially_refunded") {
        return { key: "partially-refunded", tone: "neutral" };
    }
    if (["failed", "cancelled", "canceled"].includes(payment)) {
        return { key: payment === "failed" ? "payment-failed" : "payment-cancelled", tone: "danger" };
    }
    if (["created", "requires_action", "requires_payment_method", "processing"].includes(payment)) {
        return { key: "payment-pending", tone: "progress" };
    }

    return (
        (
            {
                awaiting_quote: { key: "awaiting_quote", tone: "progress" },
                awaiting_payment: { key: "awaiting_payment", tone: "progress" },
                active: { key: "active", tone: "progress" },
                completed: { key: "completed", tone: "success" },
                expired: { key: "expired", tone: "neutral" },
                cancellation_pending: { key: "cancellation_pending", tone: "progress" },
                cancelled: { key: "cancelled", tone: "danger" },
            } as Record<string, { key: string; tone: string }>
        )[String(order?.status)] || { key: "unavailable", tone: "neutral" }
    );
}

function responseMessage(body: unknown): string {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "";
    }
    const value = (body as RecordValue).error ?? (body as RecordValue).message;
    return typeof value === "string" ? value.trim() : "";
}

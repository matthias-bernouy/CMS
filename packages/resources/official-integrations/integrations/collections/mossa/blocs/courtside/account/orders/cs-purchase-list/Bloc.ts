import { Component } from "@bernouy/components/base";
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
        "accent-color",
        "background-color",
        "border-color",
        "button-background-color",
        "button-border-color",
        "button-text-color",
        "next-label",
        "page-param",
        "page-size",
        "previous-label",
        "text-color",
    ];

    private requestVersion = 0;
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
            if (!orders.length && total === 0) {
                this.show("empty");
                return;
            }
            const renderedOrders = orders.map((order, index) => this.orderCard(order, index));
            this.list.replaceChildren(...renderedOrders.map(({ card }) => card));
            this.append(...renderedOrders.map(({ action }) => action));
            this.pageLabel.textContent = `Page ${page} sur ${pageCount}`;
            this.previousButton.toggleAttribute("disabled", page <= 1);
            this.nextButton.toggleAttribute("disabled", page >= pageCount);
            this.pagination.hidden = pageCount <= 1;
            this.show("content");
        } catch (error) {
            if (version === this.requestVersion) {
                this.fail(error);
            }
        }
    }

    private orderCard(order: RecordValue, index: number): { card: HTMLElement; action: HTMLElement } {
        const document = this.ownerDocument;
        const card = document.createElement("basic-card");
        card.setAttribute("appearance", "outlined");
        card.setAttribute("density", "compact");
        card.setAttribute("text-color", "var(--purchase-text)");
        card.setAttribute("background-color", "var(--purchase-background)");
        card.setAttribute("border-color", "var(--purchase-border)");

        const row = document.createElement("div");
        row.className = "purchase-row";

        const identity = document.createElement("div");
        identity.className = "identity";
        const number = document.createElement("strong");
        number.className = "order-number";
        const reference = String(order.orderNumber || `Commande ${order.id}`);
        const summary = lineSummaryLabel(order);
        number.textContent = summary || reference;
        const date = document.createElement("span");
        date.className = "order-date";
        const datedAt = `Passée le ${formatDate(order.createdAt)}`;
        date.textContent = summary ? `${reference} · ${datedAt}` : datedAt;
        identity.append(number, date);

        const status = document.createElement("span");
        const presentation = orderStatus(order);
        status.className = "status";
        status.dataset.tone = presentation.tone;
        status.textContent = presentation.label;

        const total = document.createElement("div");
        total.className = "amount";
        const totalLabel = document.createElement("span");
        totalLabel.textContent = "Total";
        const totalValue = document.createElement("strong");
        totalValue.textContent = money(Number(order.totalAmount), order.currency);
        total.append(totalLabel, totalValue);

        const linkWrapper = document.createElement("basic-button");
        const actionSlot = document.createElement("slot");
        actionSlot.className = "purchase-action";
        actionSlot.name = `purchase-action-${index}`;
        linkWrapper.slot = actionSlot.name;
        linkWrapper.dataset.generatedPurchaseAction = "";
        linkWrapper.setAttribute("appearance", "outlined");
        linkWrapper.setAttribute("size", "sm");
        linkWrapper.setAttribute("width", "full");
        linkWrapper.style.setProperty("--cms-button-color", "var(--purchase-button-background)");
        linkWrapper.style.setProperty("--cms-button-background", "transparent");
        linkWrapper.style.setProperty("--cms-button-border-color", "var(--purchase-button-border)");
        linkWrapper.style.setProperty("--cms-focus-color", "var(--purchase-accent)");
        const link = document.createElement("a");
        link.href = `/mon-espace/commande?orderId=${encodeURIComponent(String(order.id))}`;
        link.textContent = "Voir la commande";
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
        const properties: Array<[string, string, string]> = [
            ["text-color", "--purchase-text", "var(--ulvia-surface-text)"],
            ["background-color", "--purchase-background", "var(--ulvia-surface-background)"],
            ["border-color", "--purchase-border", "var(--ulvia-surface-border)"],
            ["accent-color", "--purchase-accent", "var(--ulvia-secondary-base)"],
            ["button-text-color", "--purchase-button-text", "var(--ulvia-primary-foreground)"],
            ["button-background-color", "--purchase-button-background", "var(--ulvia-primary-base)"],
            ["button-border-color", "--purchase-button-border", "var(--ulvia-primary-base)"],
        ];
        for (const [attribute, property, fallback] of properties) {
            this.style.setProperty(property, this.getAttribute(attribute)?.trim() || fallback);
        }
        this.previousButton.textContent = this.getAttribute("previous-label")?.trim() || "Précédent";
        this.nextButton.textContent = this.getAttribute("next-label")?.trim() || "Suivant";
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
        this.errorMessage.textContent =
            error instanceof PurchaseRequestError && isFrenchUserMessage(error.message)
                ? error.message
                : "Impossible de charger tes achats. Réessaie dans quelques instants.";
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
    private get errorMessage() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-error-message]")!;
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
function money(amount: number, currency: unknown): string {
    if (!Number.isSafeInteger(amount)) {
        return "—";
    }
    try {
        return new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: String(currency || "EUR").toUpperCase(),
        }).format(amount / 100);
    } catch {
        return `${(amount / 100).toFixed(2)} €`;
    }
}
function formatDate(value: unknown): string {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime())
        ? "date inconnue"
        : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(parsed);
}
function lineSummaryLabel(order: RecordValue): string {
    const summary = order?.lineSummary && typeof order.lineSummary === "object" ? order.lineSummary : {};
    const firstTitle = typeof summary.firstTitle === "string" ? summary.firstTitle.trim() : "";
    if (!firstTitle) {
        return "";
    }
    const lineCount = Number(summary.lineCount);
    return Number.isSafeInteger(lineCount) && lineCount > 1
        ? `${firstTitle} + ${lineCount - 1} autre${lineCount > 2 ? "s" : ""}`
        : firstTitle;
}
function orderStatus(order: RecordValue): { label: string; tone: string } {
    const operation = order?.operation && typeof order.operation === "object" ? order.operation : {};
    const settlement = String(operation.settlementStatus || "").toLowerCase();
    const payment = String(operation.paymentStatus || "").toLowerCase();
    const claim = String(operation.claimStatus || "").toLowerCase();

    if (settlement === "manual_review" || settlement === "blocked") {
        return { label: "Vérification nécessaire", tone: "danger" };
    }
    if (claim && !["resolved_buyer", "resolved_seller", "resolved_split"].includes(claim)) {
        return { label: "Litige en cours", tone: "progress" };
    }
    if (["refund_pending", "reversal_pending"].includes(settlement)) {
        return { label: "Remboursement en cours", tone: "progress" };
    }
    if (settlement === "refunded" || settlement === "reversed" || payment === "refunded") {
        return { label: "Remboursée", tone: "neutral" };
    }
    if (payment === "partially_refunded") {
        return { label: "Remboursement partiel", tone: "neutral" };
    }
    if (["failed", "cancelled", "canceled"].includes(payment)) {
        return { label: payment === "failed" ? "Paiement échoué" : "Paiement annulé", tone: "danger" };
    }
    if (["created", "requires_action", "requires_payment_method", "processing"].includes(payment)) {
        return { label: "Paiement en attente", tone: "progress" };
    }

    return (
        (
            {
                awaiting_quote: { label: "Livraison à finaliser", tone: "progress" },
                awaiting_payment: { label: "Paiement en attente", tone: "progress" },
                active: { label: "Commande en cours", tone: "progress" },
                completed: { label: "Terminée", tone: "success" },
                expired: { label: "Expirée", tone: "neutral" },
                cancellation_pending: { label: "Annulation en cours", tone: "progress" },
                cancelled: { label: "Annulée", tone: "danger" },
            } as Record<string, { label: string; tone: string }>
        )[String(order?.status)] || { label: "Statut indisponible", tone: "neutral" }
    );
}

function responseMessage(body: unknown): string {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "";
    }
    const value = (body as RecordValue).error ?? (body as RecordValue).message;
    return typeof value === "string" ? value.trim() : "";
}
function isFrenchUserMessage(value: string): boolean {
    return /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|ton|ta|tes|votre|vos|commande|paiement|achat|achats|annonce)\b/i.test(
        value,
    );
}

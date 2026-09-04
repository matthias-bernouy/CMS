import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type JsonRecord = Record<string, unknown>;
type OrderSummary = {
    id: number;
    orderNumber?: string;
    publicId?: string;
    lineSummary?: { firstTitle?: string | null };
};

export class ServiceWithdrawalForm extends Component {
    static observedAttributes = ["order-param", "service-scope", "source-id"];

    private receipt: JsonRecord | null = null;
    private idempotencyKey = newIdempotencyKey();

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.form.addEventListener("submit", this.onSubmit);
        this.retry.addEventListener("click", this.onRetry);
        this.download.addEventListener("click", this.onDownload);
        this.load().catch((error) => this.fail(error));
    }

    disconnectedCallback(): void {
        this.form.removeEventListener("submit", this.onSubmit);
        this.retry.removeEventListener("click", this.onRetry);
        this.download.removeEventListener("click", this.onDownload);
    }

    private async load(): Promise<void> {
        this.show("loading");
        const result = await this.request(`${this.endpoint("myOrders")}?limit=100&offset=0`);
        const items = Array.isArray(result.items) ? result.items.filter(isOrderSummary) : [];
        if (!items.length) {
            throw new UserFacingError("Aucune commande n’est disponible sur ce compte.");
        }
        this.renderOrders(items);
        this.show("form");
    }

    private renderOrders(orders: OrderSummary[]): void {
        this.order.replaceChildren();
        for (const order of orders) {
            const option = document.createElement("option");
            option.value = String(order.id);
            const reference = order.orderNumber || order.publicId || `Commande ${order.id}`;
            const title = String(order.lineSummary?.firstTitle || "").trim();
            option.textContent = title ? `${reference} — ${title}` : reference;
            this.order.append(option);
        }
        const requested = new URL(this.ownerDocument.defaultView?.location.href || location.href).searchParams.get(
            this.getAttribute("order-param")?.trim() || "orderId",
        );
        if (requested && orders.some((order) => String(order.id) === requested)) {
            this.order.value = requested;
        }
    }

    private onRetry = (): void => {
        this.load().catch((error) => this.fail(error));
    };

    private onSubmit = async (event: SubmitEvent): Promise<void> => {
        event.preventDefault();
        this.validation.textContent = "";
        if (!this.order.value) {
            this.validation.textContent = "Sélectionne la commande concernée.";
            this.order.focus();
            return;
        }
        if (!this.confirmed.checked) {
            this.validation.textContent = "Confirme explicitement ta demande pour continuer.";
            this.confirmed.focus();
            return;
        }

        this.submit.toggleAttribute("disabled", true);
        this.submit.setAttribute("aria-busy", "true");
        try {
            const result = await this.request(this.endpoint("submitMyMarketplaceServiceWithdrawalRequest"), {
                method: "POST",
                body: JSON.stringify({
                    orderId: Number(this.order.value),
                    serviceScope: this.getAttribute("service-scope")?.trim() || "courtside_marketplace_service",
                    reason: this.reason.value.trim() || null,
                    confirmed: true,
                    idempotencyKey: this.idempotencyKey,
                }),
            });
            this.receipt = result;
            this.renderReceipt(result);
            this.idempotencyKey = newIdempotencyKey();
            this.show("success");
        } catch (error) {
            this.validation.textContent = publicError(error);
        } finally {
            this.submit.removeAttribute("disabled");
            this.submit.removeAttribute("aria-busy");
        }
    };

    private renderReceipt(receipt: JsonRecord): void {
        this.setText(this.requestReference, receipt.publicId);
        this.setText(this.orderReference, receipt.orderNumber || receipt.orderPublicId || receipt.orderId);
        this.setText(this.confirmedAt, formatDateTime(receipt.confirmedAt || receipt.submittedAt));
        this.setText(this.status, statusLabel(receipt.status));
    }

    private onDownload = (): void => {
        if (!this.receipt) {
            return;
        }
        const reference = String(this.receipt.publicId || "").trim();
        const content = [
            "Accusé de réception — demande de rétractation du service Courtside",
            `Référence : ${reference || "indisponible"}`,
            `Commande : ${String(this.receipt.orderNumber || this.receipt.orderPublicId || this.receipt.orderId || "indisponible")}`,
            `Date et heure : ${formatDateTime(this.receipt.confirmedAt || this.receipt.submittedAt)}`,
            `Statut : ${statusLabel(this.receipt.status)}`,
            `Périmètre : ${String(this.receipt.serviceScope || "")}`,
            "",
            "Cette demande est enregistrée pour examen. Elle ne prouve pas à elle seule",
            "qu’une annulation, un remboursement ou une opération de paiement a été exécuté.",
        ].join("\n");
        const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `courtside-retractation-${safeFilePart(reference || "accuse")}.txt`;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    private async request(path: string, init: RequestInit = {}): Promise<JsonRecord> {
        const response = await fetch(path, {
            credentials: "include",
            ...init,
            headers: {
                accept: "application/json",
                ...(init.body ? { "content-type": "application/json" } : {}),
                ...headers(init.headers),
            },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
            throw new RemoteError(responseError(body));
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("invalid response");
        }
        return body as JsonRecord;
    }

    private endpoint(name: string): string {
        const source = this.getAttribute("source-id")?.trim() || "commerce";
        return `/.cms/sources/${encodeURIComponent(source)}/${name}`;
    }

    private fail(error: unknown): void {
        this.errorMessage.textContent =
            error instanceof UserFacingError
                ? error.message
                : "Impossible de charger tes commandes. Connecte-toi puis réessaie.";
        this.show("error");
    }

    private show(state: "loading" | "form" | "error" | "success"): void {
        this.loading.hidden = state !== "loading";
        this.form.hidden = state !== "form";
        this.error.hidden = state !== "error";
        this.success.hidden = state !== "success";
    }

    private setText(target: HTMLElement, value: unknown): void {
        target.textContent = String(value ?? "—");
    }

    private get loading() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-loading]")!;
    }
    private get form() {
        return this.shadowRoot!.querySelector<HTMLFormElement>("[data-form]")!;
    }
    private get error() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-error]")!;
    }
    private get success() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-success]")!;
    }
    private get errorMessage() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-error-message]")!;
    }
    private get order() {
        return this.shadowRoot!.querySelector<HTMLSelectElement>("[data-order]")!;
    }
    private get reason() {
        return this.shadowRoot!.querySelector<HTMLTextAreaElement>("[data-reason]")!;
    }
    private get confirmed() {
        return this.shadowRoot!.querySelector<HTMLInputElement>("[data-confirmed]")!;
    }
    private get validation() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-validation]")!;
    }
    private get submit() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-submit]")!;
    }
    private get retry() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-retry]")!;
    }
    private get download() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-download]")!;
    }
    private get requestReference() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-request-reference]")!;
    }
    private get orderReference() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-order-reference]")!;
    }
    private get confirmedAt() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-confirmed-at]")!;
    }
    private get status() {
        return this.shadowRoot!.querySelector<HTMLElement>("[data-status]")!;
    }
}

class UserFacingError extends Error {}
class RemoteError extends Error {}

function isOrderSummary(value: unknown): value is OrderSummary {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const id = Number((value as JsonRecord).id);
    return Number.isSafeInteger(id) && id > 0;
}

function newIdempotencyKey(): string {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatDateTime(value: unknown): string {
    const date = new Date(String(value || ""));
    return Number.isNaN(date.getTime())
        ? "—"
        : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

function statusLabel(value: unknown): string {
    return (
        (
            {
                submitted: "Reçue",
                under_review: "En cours d’examen",
                information_requested: "Informations demandées",
                resolved: "Traitée",
            } as Record<string, string>
        )[String(value)] || "Reçue"
    );
}

function responseError(body: unknown): string {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "";
    }
    const record = body as JsonRecord;
    return typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : "";
}

function publicError(error: unknown): string {
    if (!(error instanceof RemoteError)) {
        return "La demande n’a pas pu être enregistrée. Réessaie dans quelques instants.";
    }
    if (error.message.includes("already exists")) {
        return "Une demande existe déjà pour cette commande. Retrouve-la depuis ton compte ou contacte Courtside.";
    }
    if (error.message.includes("not_found")) {
        return "Cette commande est introuvable ou n’appartient pas à ton compte.";
    }
    return "La demande n’a pas pu être enregistrée. Réessaie dans quelques instants.";
}

function safeFilePart(value: string): string {
    return (
        value
            .replace(/[^a-z0-9_-]+/gi, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80) || "accuse"
    );
}

function headers(value: HeadersInit | undefined): Record<string, string> {
    if (!value) {
        return {};
    }
    if (value instanceof Headers) {
        return Object.fromEntries(value.entries());
    }
    if (Array.isArray(value)) {
        return Object.fromEntries(value);
    }
    return value as Record<string, string>;
}

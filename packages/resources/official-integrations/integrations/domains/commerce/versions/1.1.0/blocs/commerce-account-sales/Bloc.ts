import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { errorMessage, positiveInteger, saleFilterDefaults, saleStatusDefaults, saleStatuses } from "./helpers";
import { copyColors, renderSale } from "./render";

const requestAttributes = new Set(["source-id", "source-prefix", "sales-endpoint", "page-size"]);
const urlStateAttributes = new Set(["page-param", "status-param", "sync-url"]);

export class CommerceAccountSales extends Component {
    static observedAttributes = [
        "source-id",
        "source-prefix",
        "sales-endpoint",
        "page-size",
        "page-param",
        "status-param",
        "sync-url",
        "detail-url",
        "detail-param",
        "detail-label",
        "date-prefix",
        "locale",
        "status-label",
        "previous-label",
        "next-label",
        "summary-template",
        "card-appearance",
        "button-appearance",
        "text-color",
        "muted-text-color",
        "status-background-color",
        "status-text-color",
        "success-color",
        "danger-color",
        "empty-title",
        "empty-message",
        "error-message",
        ...["card", "button", "field"].flatMap((prefix) =>
            ["text", "background", "border", "accent"].map((name) => `${prefix}-${name}-color`),
        ),
        ...saleStatuses.map((status) => `label-${status}`),
        ...saleStatuses.map((status) => `filter-label-${status}`),
    ];

    constructor() {
        super({ css, template });
        this.page = 1;
        this.status = "all";
        this.items = [];
        this.total = 0;
        this.hasLoaded = false;
        this.loadScheduled = false;
        this.lastLoadedKey = "";
        this.inFlight = null;
        this.controller = null;
    }

    connectedCallback() {
        this.readUrl();
        this.filter.addEventListener("change", this.onFilterChange);
        this.pagination.addEventListener("basic-pagination:change", this.onPageChange);
        window.addEventListener("popstate", this.onPopState);
        this.syncPresentation();
        this.scheduleLoad();
    }

    disconnectedCallback() {
        this.filter.removeEventListener("change", this.onFilterChange);
        this.pagination.removeEventListener("basic-pagination:change", this.onPageChange);
        window.removeEventListener("popstate", this.onPopState);
        this.controller?.abort();
        this.controller = null;
        this.inFlight = null;
        this.loadScheduled = false;
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) {
            return;
        }
        if (urlStateAttributes.has(name)) {
            this.readUrl();
        }
        this.syncPresentation();
        if (requestAttributes.has(name) || urlStateAttributes.has(name)) {
            this.scheduleLoad();
        } else if (this.hasLoaded) {
            this.renderItems();
        }
    }

    scheduleLoad() {
        if (this.loadScheduled) {
            return;
        }
        this.loadScheduled = true;
        queueMicrotask(() => {
            this.loadScheduled = false;
            if (this.isConnected) {
                void this.load();
            }
        });
    }

    load({ force = false } = {}) {
        const request = this.buildRequest();
        if (!force && request.key === this.lastLoadedKey && this.hasLoaded) {
            this.renderItems();
            return Promise.resolve();
        }
        if (this.inFlight?.key === request.key) {
            return this.inFlight.promise;
        }
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        this.show("loading");
        const promise = this.executeLoad(request, controller);
        this.inFlight = { key: request.key, promise };
        return promise.finally(() => {
            if (this.inFlight?.promise === promise) {
                this.inFlight = null;
            }
        });
    }

    buildRequest() {
        const size = positiveInteger(this.getAttribute("page-size"), 10);
        const query = new URLSearchParams({ limit: String(size), offset: String((this.page - 1) * size) });
        if (this.status !== "all") {
            query.set("status", this.status);
        }
        const path = `${this.sourceBase}/${encodeURIComponent(this.endpoint)}?${query}`;
        return { key: path, path, size };
    }

    async executeLoad(request, controller) {
        try {
            const data = await requestJson(request.path, controller.signal);
            if (controller.signal.aborted || !this.isConnected) {
                return;
            }
            const total = Number.isSafeInteger(Number(data.total)) ? Number(data.total) : 0;
            const pages = Math.max(1, Math.ceil(total / request.size));
            if (this.page > pages) {
                this.page = pages;
                this.writeUrl();
                this.scheduleLoad();
                return;
            }
            this.items = Array.isArray(data.items) ? data.items : [];
            this.total = total;
            this.hasLoaded = true;
            this.lastLoadedKey = request.key;
            this.renderItems();
        } catch (error) {
            if (controller.signal.aborted) {
                return;
            }
            this.fail(error);
        }
    }

    renderItems() {
        const size = positiveInteger(this.getAttribute("page-size"), 10);
        this.list.replaceChildren(...this.items.map((sale) => renderSale(this, sale)));
        this.pagination.setAttribute("page", String(this.page));
        this.pagination.setAttribute("page-size", String(size));
        this.pagination.setAttribute("total", String(this.total));
        this.pagination.hidden = this.total <= size;
        this.show(this.items.length ? "content" : "empty");
    }

    syncPresentation() {
        this.style.setProperty("--commerce-sales-text", this.getAttribute("text-color") || "var(--text-main)");
        for (const [attribute, property] of [
            ["muted-text-color", "--commerce-sales-muted"],
            ["status-background-color", "--commerce-sales-status-background"],
            ["status-text-color", "--commerce-sales-status-text"],
            ["success-color", "--commerce-sales-success"],
            ["danger-color", "--commerce-sales-danger"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.style.setProperty(property, value);
            } else {
                this.style.removeProperty(property);
            }
        }
        this.filter.setAttribute("value", this.status);
        copyColors(this, this.filter, "field");
        this.filter.setAttribute(
            "accessible-label",
            this.getAttribute("status-label") || "Filtrer les ventes par statut",
        );
        for (const [source, target] of [
            ["button-text-color", "button-text-color"],
            ["button-background-color", "button-background-color"],
            ["button-border-color", "button-border-color"],
            ["button-accent-color", "accent-color"],
            ["text-color", "text-color"],
        ]) {
            const value = this.getAttribute(source)?.trim();
            if (value) {
                this.pagination.setAttribute(target, value);
            } else {
                this.pagination.removeAttribute(target);
            }
        }
        for (const name of ["previous-label", "next-label", "summary-template"]) {
            const value = this.getAttribute(name)?.trim();
            if (value) {
                this.pagination.setAttribute(name, value);
            } else {
                this.pagination.removeAttribute(name);
            }
        }
        copyColors(this, this.empty, "card");
        copyColors(this, this.error, "card");
        for (const option of this.filter.querySelectorAll("basic-option")) {
            option.textContent = this.filterLabel(option.getAttribute("value"));
        }
        this.empty.querySelector("[data-empty-title]").textContent =
            this.getAttribute("empty-title") || "Aucune vente pour le moment";
        this.empty.querySelector("[data-empty-message]").textContent =
            this.getAttribute("empty-message") || "Les commandes de vos acheteurs apparaîtront ici.";
    }

    statusLabel(status) {
        return this.getAttribute(`label-${status}`) || saleStatusDefaults[status] || "À vérifier";
    }
    filterLabel(status) {
        return this.getAttribute(`filter-label-${status}`) || saleFilterDefaults[status] || this.statusLabel(status);
    }
    readUrl() {
        if (this.getAttribute("sync-url") === "false") {
            return;
        }
        this.status = "all";
        this.page = 1;
        const query = new URLSearchParams(location.search);
        const status = query.get(this.statusParam);
        if (saleStatuses.includes(status)) {
            this.status = status;
        }
        this.page = positiveInteger(query.get(this.pageParam), 1);
    }
    writeUrl() {
        if (this.getAttribute("sync-url") === "false") {
            return;
        }
        const url = new URL(location.href);
        this.status === "all"
            ? url.searchParams.delete(this.statusParam)
            : url.searchParams.set(this.statusParam, this.status);
        this.page <= 1
            ? url.searchParams.delete(this.pageParam)
            : url.searchParams.set(this.pageParam, String(this.page));
        history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    show(state) {
        this.loading.hidden = state !== "loading";
        this.list.hidden = state !== "content";
        this.empty.hidden = state !== "empty";
        this.error.hidden = state !== "error";
        if (state !== "content") {
            this.pagination.hidden = true;
        }
    }
    fail(error) {
        this.error.querySelector("[data-error-message]").textContent = errorMessage(
            error,
            this.getAttribute("error-message") || "Réessayez dans quelques instants.",
        );
        this.show("error");
    }

    onFilterChange = (event) => {
        if (event.target !== this.filter) {
            return;
        }
        const status = String(event.target.value || "all");
        if (!saleStatuses.includes(status)) {
            return;
        }
        this.status = status;
        this.page = 1;
        this.writeUrl();
        this.scheduleLoad();
    };
    onPageChange = (event) => {
        this.page = positiveInteger(event.detail?.page, 1);
        this.writeUrl();
        this.scheduleLoad();
        this.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    onPopState = () => {
        this.readUrl();
        this.syncPresentation();
        this.scheduleLoad();
    };
    get sourceBase() {
        return `${(this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "")}/${encodeURIComponent(this.getAttribute("source-id") || "commerce")}`;
    }
    get endpoint() {
        return this.getAttribute("sales-endpoint") || "mySales";
    }
    get detailUrl() {
        return this.getAttribute("detail-url") || "/account/sale";
    }
    get detailParam() {
        return this.getAttribute("detail-param") || "orderId";
    }
    get locale() {
        return this.getAttribute("locale") || "fr-FR";
    }
    get statusParam() {
        return this.getAttribute("status-param") || "status";
    }
    get pageParam() {
        return this.getAttribute("page-param") || "page";
    }
    get loading() {
        return this.shadowRoot.querySelector("[data-loading]");
    }
    get list() {
        return this.shadowRoot.querySelector("[data-list]");
    }
    get empty() {
        return this.shadowRoot.querySelector("[data-empty]");
    }
    get error() {
        return this.shadowRoot.querySelector("[data-error]");
    }
    get filter() {
        return this.shadowRoot.querySelector("[data-status-filter]");
    }
    get pagination() {
        return this.shadowRoot.querySelector("[data-pagination]");
    }
}

async function requestJson(path, signal) {
    const response = await fetch(path, {
        credentials: "include",
        headers: { accept: "application/json" },
        signal,
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(body?.error || body?.message || `${response.status} ${response.statusText}`);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Réponse du service Commerce invalide.");
    }
    return body;
}
customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceAccountSales);

import { Composition } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };

const statuses = ["all", "pending", "accepted", "rejected", "withdrawn", "expired", "superseded", "canceled"];
const defaultStatusLabels = {
    all: "Toutes",
    pending: "En attente",
    accepted: "Acceptées",
    rejected: "Refusées",
    withdrawn: "Retirées",
    expired: "Expirées",
    superseded: "Remplacées",
    canceled: "Annulées",
};

export class CommerceNegotiationList extends Composition {
    static observedAttributes = [
        "accept-label", "button-accent-color", "button-background-color", "button-border-color",
        "button-text-color", "card-appearance", "card-background-color", "card-border-color",
        "card-density", "card-muted-text-color", "card-text-color", "copy", "empty-filtered-message",
        "empty-filtered-title", "empty-message", "empty-title", "error-message", "expiration-label", "field-accent-color",
        "field-background-color", "field-border-color", "field-text-color", "grid-gap", "grid-max",
        "grid-min", "initial-role", "locale", "page-param", "page-size", "proposed-label", "received-label",
        "reference-label", "reject-label", "show-expiration", "show-message", "show-reference-price",
        "role-accent-color", "role-background-color", "role-border-color", "role-param",
        "role-selected-background-color", "role-selected-text-color", "role-text-color",
        "show-header", "show-role-tabs", "skeleton-base-color", "skeleton-highlight-color", "source-id", "source-prefix",
        "status-label", "success-accept-message", "success-reject-message", "success-withdraw-message",
        "sent-label", "status-param", "sync-url", "text-color", "title", "toast-background-color", "toast-border-color", "toast-error-background-color",
        "toast-error-border-color", "toast-error-text-color", "toast-text-color", "withdraw-label",
        ...statuses.map(status => `label-${status}`),
    ];

    constructor() {
        super({ template });
        this.role = "seller";
        this.status = "all";
        this.page = 1;
        this.total = 0;
        this.items = [];
        this.controller = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this.role = this.getAttribute("initial-role") === "buyer" ? "buyer" : "seller";
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("basic-pagination:change", this.onPageChange);
        this.addEventListener("click", this.onActionClick);
        this.readUrlState();
        this.syncPresentation();
        if (isFramed()) this.showPreview();
        else void this.load();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("basic-pagination:change", this.onPageChange);
        this.removeEventListener("click", this.onActionClick);
        this.controller?.abort();
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) return;
        if (name === "initial-role") this.role = this.getAttribute("initial-role") === "buyer" ? "buyer" : "seller";
        queueMicrotask(() => {
            this.syncPresentation();
            this.renderItems();
        });
        if (["source-id", "source-prefix", "page-size", "initial-role"].includes(name) && !isFramed()) {
            this.page = 1;
            queueMicrotask(() => void this.load());
        }
    }

    async load(silent = false) {
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        if (!silent) this.showLoading();
        const pageSize = positiveInteger(this.getAttribute("page-size"), 12);
        try {
            const result = await this.requestSource("myProposals", {
                query: {
                    role: this.role,
                    ...(this.status === "all" ? {} : { status: this.status }),
                    limit: pageSize,
                    offset: (this.page - 1) * pageSize,
                },
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;
            this.items = Array.isArray(result.items) ? result.items.filter(isProposal) : [];
            this.total = nonNegativeInteger(result.total, this.items.length);
            this.renderItems();
        } catch (error) {
            if (controller.signal.aborted) return;
            if (!silent) {
                this.items = [];
                this.total = 0;
                this.renderItems();
            }
            this.showToast(errorMessage(error, this.getAttribute("error-message") || "Impossible de charger les offres de prix."), true);
        }
    }

    showPreview() {
        this.items = [
            {
                id: 1,
                offerTitle: "Raquette de tennis",
                proposedAmount: 12000,
                referenceAmount: 15000,
                currency: "eur",
                buyerMessage: "Bonjour, accepterais-tu mon offre ?",
                status: "pending",
                version: 1,
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
                viewerRole: this.role,
            },
        ];
        this.total = 1;
        this.renderItems();
    }

    syncPresentation() {
        setText(this.querySelector("[data-title]"), this.getAttribute("title") || "Mes offres de prix");
        setText(this.querySelector("[data-copy]"), this.getAttribute("copy") || "Retrouve les propositions reçues et celles que tu as envoyées.");
        setHidden(this.querySelector("[data-header]"), this.getAttribute("show-header") === "false");
        copyAttribute(this, this.querySelector("[data-layout]"), "text-color");

        const roleFilter = this.querySelector("[data-role-filter]");
        setHidden(roleFilter, this.getAttribute("show-role-tabs") === "false");
        setAttribute(roleFilter, "value", this.role);
        if (roleFilter.value !== this.role) roleFilter.value = this.role;
        const receivedChip = this.querySelector("[data-received-chip]");
        const sentChip = this.querySelector("[data-sent-chip]");
        receivedChip.toggleAttribute("selected", this.role === "seller");
        sentChip.toggleAttribute("selected", this.role === "buyer");
        setText(receivedChip, this.getAttribute("received-label") || "Offres reçues");
        setText(sentChip, this.getAttribute("sent-label") || "Offres envoyées");
        copyColors(this, roleFilter, "role", [
            "accent-color", "text-color", "background-color", "border-color",
            "selected-background-color", "selected-text-color",
        ]);

        const statusFilter = this.querySelector("[data-status-filter]");
        statusFilter.removeAttribute("label");
        setAttribute(statusFilter, "accessible-label", this.getAttribute("status-label") || "Filtrer par statut");
        setAttribute(statusFilter, "value", this.status);
        copyColors(this, statusFilter, "field", ["accent-color", "text-color", "background-color", "border-color"]);
        for (const option of statusFilter?.querySelectorAll("basic-option") ?? []) {
            setText(option, this.statusLabel(option.getAttribute("value")));
        }

        const grid = this.querySelector("[data-items]");
        setAttribute(grid, "min", this.getAttribute("grid-min") || "md");
        setAttribute(grid, "max", this.getAttribute("grid-max") || "xl");
        setAttribute(grid, "gap", this.getAttribute("grid-gap") || "md");
        for (const skeleton of this.querySelectorAll("basic-skeleton")) {
            copyAttribute(this, skeleton, "skeleton-base-color", "base-color");
            copyAttribute(this, skeleton, "skeleton-highlight-color", "highlight-color");
        }
        const pagination = this.querySelector("[data-pagination]");
        setAttribute(pagination, "page-size", String(positiveInteger(this.getAttribute("page-size"), 12)));
        copyAttribute(this, pagination, "button-accent-color", "accent-color");
        copyAttribute(this, pagination, "button-background-color");
        copyAttribute(this, pagination, "button-border-color");
        copyAttribute(this, pagination, "button-text-color");
    }

    renderItems() {
        const grid = this.querySelector("[data-items]");
        const itemTemplate = this.querySelector("[data-item-template]");
        if (!grid || !itemTemplate) return;
        grid.replaceChildren();
        for (const proposal of this.items) {
            const fragment = itemTemplate.content.cloneNode(true);
            const card = fragment.querySelector("[data-proposal-card]");
            card.dataset.proposalId = String(proposal.id);
            setAttribute(card, "appearance", this.getAttribute("card-appearance") || "outlined");
            setAttribute(card, "density", this.getAttribute("card-density") || "compact");
            copyColors(this, card, "card", ["text-color", "background-color", "border-color", "muted-text-color"]);
            setText(fragment.querySelector("[data-offer-title]"), proposal.offerTitle);
            setText(fragment.querySelector("[data-status]"), this.statusLabel(proposal.status));
            setText(fragment.querySelector("[data-proposed-label]"), this.getAttribute("proposed-label") || "Prix proposé");
            setText(fragment.querySelector("[data-proposed-amount]"), this.formatMoney(proposal.proposedAmount, proposal.currency));
            setText(fragment.querySelector("[data-reference-label]"), this.getAttribute("reference-label") || "Prix initial");
            setText(fragment.querySelector("[data-reference-amount]"), this.formatMoney(proposal.referenceAmount, proposal.currency));
            setHidden(fragment.querySelector("[data-reference-group]"), this.getAttribute("show-reference-price") === "false");

            const message = fragment.querySelector("[data-message]");
            setHidden(message, this.getAttribute("show-message") === "false" || !proposal.buyerMessage);
            setText(message, proposal.buyerMessage ? `“${proposal.buyerMessage}”` : "");
            const expiration = fragment.querySelector("[data-expiration]");
            setHidden(expiration, this.getAttribute("show-expiration") === "false" || !proposal.expiresAt);
            setText(expiration, proposal.expiresAt ? this.formatExpiration(proposal.expiresAt) : "");

            const canDecide = proposal.status === "pending" && this.role === "seller";
            const canWithdraw = proposal.status === "pending" && this.role === "buyer";
            const accept = fragment.querySelector('[data-action="accept"]');
            const reject = fragment.querySelector('[data-action="reject"]');
            const withdraw = fragment.querySelector('[data-action="withdraw"]');
            setHidden(accept, !canDecide);
            setHidden(reject, !canDecide);
            setHidden(withdraw, !canWithdraw);
            setText(accept, this.getAttribute("accept-label") || "Accepter");
            setText(reject, this.getAttribute("reject-label") || "Refuser");
            setText(withdraw, this.getAttribute("withdraw-label") || "Retirer");
            for (const button of [accept, reject, withdraw]) copyColors(this, button, "button", ["accent-color", "text-color", "background-color", "border-color"]);
            grid.append(fragment);
        }

        setHidden(this.querySelector("[data-loading]"), true);
        setHidden(grid, this.items.length === 0);
        const empty = this.querySelector("[data-empty-state]");
        setHidden(empty, this.items.length !== 0);
        copyColors(this, empty, "card", ["text-color", "background-color", "border-color", "muted-text-color"]);
        const unfiltered = this.status === "all";
        setText(this.querySelector("[data-empty-title]"), unfiltered
            ? this.getAttribute("empty-title") || (this.role === "seller" ? "Aucune offre reçue pour le moment" : "Aucune offre envoyée pour le moment")
            : this.getAttribute("empty-filtered-title") || "Aucune offre avec ce statut");
        setText(this.querySelector("[data-empty-message]"), unfiltered
            ? this.getAttribute("empty-message") || (this.role === "seller"
                ? "Les propositions envoyées par les acheteurs apparaîtront ici."
                : "Les propositions que tu envoies apparaîtront ici.")
            : this.getAttribute("empty-filtered-message") || "Essaie un autre statut pour retrouver tes offres.");
        const pagination = this.querySelector("[data-pagination]");
        setAttribute(pagination, "page", String(this.page));
        setAttribute(pagination, "total", String(this.total));
        setHidden(pagination, this.total <= positiveInteger(this.getAttribute("page-size"), 12));
    }

    onFilterChange = event => {
        if (event.target?.matches?.("[data-role-filter]")) {
            const role = event.target.value;
            if (role !== "buyer" && role !== "seller") return;
            this.role = role;
        } else if (event.target?.matches?.("[data-status-filter]")) {
            const status = String(event.target.value || "all");
            if (!statuses.includes(status)) return;
            this.status = status;
        } else return;
        this.page = 1;
        this.writeUrlState();
        this.syncPresentation();
        if (isFramed()) this.showPreview();
        else void this.load();
    };

    onPageChange = event => {
        if (!event.target?.matches?.("[data-pagination]")) return;
        this.page = positiveInteger(event.detail?.page, 1);
        this.writeUrlState();
        void this.load();
        this.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    readUrlState() {
        if (this.getAttribute("sync-url") === "false" || typeof location === "undefined") return;
        const params = new URLSearchParams(location.search);
        const role = params.get(this.getAttribute("role-param") || "role");
        const status = params.get(this.getAttribute("status-param") || "status");
        if (role === "buyer" || role === "seller") this.role = role;
        if (status && statuses.includes(status)) this.status = status;
        this.page = positiveInteger(params.get(this.getAttribute("page-param") || "page"), 1);
    }

    writeUrlState() {
        if (this.getAttribute("sync-url") === "false" || typeof location === "undefined" || typeof history === "undefined") return;
        const url = new URL(location.href);
        const roleParam = this.getAttribute("role-param") || "role";
        const statusParam = this.getAttribute("status-param") || "status";
        const pageParam = this.getAttribute("page-param") || "page";
        const initialRole = this.getAttribute("initial-role") === "buyer" ? "buyer" : "seller";
        if (this.role === initialRole) url.searchParams.delete(roleParam);
        else url.searchParams.set(roleParam, this.role);
        if (this.status === "all") url.searchParams.delete(statusParam);
        else url.searchParams.set(statusParam, this.status);
        if (this.page <= 1) url.searchParams.delete(pageParam);
        else url.searchParams.set(pageParam, String(this.page));
        history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    onActionClick = event => {
        const button = event.composedPath().find(node => node instanceof HTMLElement && node.matches?.("[data-action]"));
        if (!button || button.disabled) return;
        const card = button.closest("[data-proposal-card]");
        const proposal = this.items.find(item => String(item.id) === card?.dataset.proposalId);
        if (!proposal) return;
        void this.performAction(proposal, button.dataset.action, card);
    };

    async performAction(proposal, action, card) {
        if (!["accept", "reject", "withdraw"].includes(action)) return;
        const buttons = Array.from(card.querySelectorAll("[data-action]"));
        for (const button of buttons) button.disabled = true;
        try {
            const updated = action === "withdraw"
                ? await this.requestSource("withdrawMyProposal", {
                    method: "POST",
                    body: { id: proposal.id, expectedVersion: proposal.version },
                })
                : await this.requestSource("respondToProposal", {
                    method: "POST",
                    body: { id: proposal.id, expectedVersion: proposal.version, action },
                });
            const index = this.items.findIndex(item => item.id === proposal.id);
            if (index >= 0 && isProposal(updated)) this.items[index] = updated;
            this.renderItems();
            const message = action === "accept"
                ? this.getAttribute("success-accept-message") || "L’offre a été acceptée."
                : action === "reject"
                    ? this.getAttribute("success-reject-message") || "L’offre a été refusée."
                    : this.getAttribute("success-withdraw-message") || "Ton offre a été retirée.";
            this.showToast(message, false);
            const eventName = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "withdrawn";
            this.dispatchEvent(new CustomEvent(`commerce-negotiation:${eventName}`, {
                bubbles: true,
                composed: true,
                detail: updated,
            }));
            if (!isFramed()) void this.load(true);
        } catch (error) {
            for (const button of buttons) button.disabled = false;
            this.showToast(errorMessage(error, this.getAttribute("error-message") || "Impossible de mettre à jour cette offre."), true);
        }
    }

    async requestSource(endpoint, options = {}) {
        const url = new URL(this.sourceUrl(endpoint), this.ownerDocument.baseURI);
        for (const [name, value] of Object.entries(options.query || {})) url.searchParams.set(name, String(value));
        const response = await fetch(url, {
            credentials: "include",
            method: options.method || "GET",
            signal: options.signal,
            headers: {
                accept: "application/json",
                ...(options.body ? { "content-type": "application/json" } : {}),
            },
            ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body && typeof body.error === "string" ? body.error : `${response.status} ${response.statusText}`);
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Réponse invalide du service.");
        return body;
    }

    sourceUrl(endpoint) {
        const prefix = (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
        const sourceId = encodeURIComponent(this.getAttribute("source-id") || "commerce-negotiation");
        return `${prefix}/${sourceId}/${encodeURIComponent(endpoint)}`;
    }

    statusLabel(status) {
        const code = statuses.includes(status) ? status : "pending";
        return this.getAttribute(`label-${code}`) || defaultStatusLabels[code];
    }

    formatMoney(amount, currency) {
        try {
            return new Intl.NumberFormat(this.getAttribute("locale") || "fr-FR", {
                style: "currency",
                currency: currency.toUpperCase(),
            }).format(amount / 100);
        } catch {
            return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
        }
    }

    formatExpiration(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const label = this.getAttribute("expiration-label") || "Expire le {date}";
        const formatted = new Intl.DateTimeFormat(this.getAttribute("locale") || "fr-FR", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(date);
        return label.replaceAll("{date}", formatted);
    }

    showLoading() {
        setHidden(this.querySelector("[data-loading]"), false);
        setHidden(this.querySelector("[data-items]"), true);
        setHidden(this.querySelector("[data-empty-state]"), true);
        setHidden(this.querySelector("[data-pagination]"), true);
    }

    showToast(message, error) {
        const toast = this.querySelector("[data-toast-template]")?.content.firstElementChild?.cloneNode(true)
            ?? this.ownerDocument.createElement("basic-toast");
        toast.setAttribute("role", error ? "alert" : "status");
        toast.textContent = message;
        const prefix = error ? "toast-error" : "toast";
        copyColors(this, toast, prefix, ["text-color", "background-color", "border-color"]);
        this.querySelector("[data-toast-region]")?.replaceChildren(toast);
    }
}

function isProposal(value) {
    return value && typeof value === "object" && Number.isSafeInteger(value.id)
        && typeof value.offerTitle === "string" && Number.isSafeInteger(value.proposedAmount)
        && Number.isSafeInteger(value.referenceAmount) && typeof value.currency === "string"
        && statuses.includes(value.status) && Number.isSafeInteger(value.version);
}

function positiveInteger(value, fallback = null) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
}

function setAttribute(element, name, value) {
    if (element && element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function copyAttribute(source, target, sourceName, targetName = sourceName) {
    if (!target) return;
    const value = source.getAttribute(sourceName)?.trim();
    if (value) target.setAttribute(targetName, value);
    else target.removeAttribute(targetName);
}

function copyColors(source, target, prefix, names) {
    for (const name of names) copyAttribute(source, target, `${prefix}-${name}`, name);
}

function setHidden(element, hidden) {
    if (!element) return;
    element.toggleAttribute("hidden", hidden);
    if (hidden) element.style.setProperty("display", "none", "important");
    else element.style.removeProperty("display");
}

function errorMessage(error, fallback) {
    console.error(error);
    const message = error instanceof Error ? error.message.trim() : "";
    return isFrenchUserMessage(message) ? message : fallback;
}

function isFrenchUserMessage(value) {
    return Boolean(value) && /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|ton|ta|tes|votre|vos|offre|prix|montant|proposition|conditions|annonce|réponse)\b/i.test(value);
}

function isFramed() {
    try { return window.self !== window.top; } catch { return true; }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceNegotiationList);

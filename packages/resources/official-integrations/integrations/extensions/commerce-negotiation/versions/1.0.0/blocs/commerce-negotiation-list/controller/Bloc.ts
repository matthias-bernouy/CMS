import { Component } from "@bernouy/components/base";

const statuses = ["all", "pending", "accepted", "rejected", "withdrawn", "expired", "superseded", "canceled"];
const roles = ["all", "buyer", "seller"];
const defaultStatusLabels = {
    all: "Toutes",
    pending: "En attente",
    accepted: "Acceptée",
    rejected: "Refusée",
    withdrawn: "Retirée",
    expired: "Expirée",
    superseded: "Remplacée",
    canceled: "Annulée",
};
const defaultFilterLabels = {
    all: "Toutes",
    pending: "En attente",
    accepted: "Acceptées",
    rejected: "Refusées",
    withdrawn: "Retirées",
    expired: "Expirées",
    superseded: "Remplacées",
    canceled: "Annulées",
};
const reloadAttributes = new Set(["source-id", "source-prefix", "page-size", "initial-role"]);

export class CommerceNegotiationList extends Component {
    static observedAttributes = [
        "accept-label",
        "accept-button-accent-color",
        "accept-button-background-color",
        "accept-button-border-color",
        "accept-button-text-color",
        "button-accent-color",
        "button-background-color",
        "button-border-color",
        "button-text-color",
        "card-appearance",
        "card-background-color",
        "card-border-color",
        "card-density",
        "card-muted-text-color",
        "card-text-color",
        "combined-label",
        "copy",
        "checkout-expiration-label",
        "checkout-label-template",
        "checkout-param",
        "checkout-url",
        "commerce-source-id",
        "confirm-accept-message",
        "confirm-reject-message",
        "confirm-withdraw-message",
        "decision-label-template",
        "empty-filtered-message",
        "empty-filtered-title",
        "empty-message",
        "empty-title",
        "error-message",
        "expiration-label",
        "field-accent-color",
        "field-background-color",
        "field-border-color",
        "field-text-color",
        "grid-gap",
        "grid-max",
        "grid-min",
        "grid-packing",
        "initial-role",
        "locale",
        "image-endpoint",
        "offer-param",
        "offer-url",
        "order-label",
        "order-param",
        "order-url",
        "page-param",
        "page-size",
        "proposed-label",
        "received-label",
        "received-direction-label",
        "reference-label",
        "reject-label",
        "reject-button-accent-color",
        "reject-button-background-color",
        "reject-button-border-color",
        "reject-button-text-color",
        "show-expiration",
        "show-message",
        "show-reference-price",
        "role-accent-color",
        "role-background-color",
        "role-border-color",
        "role-param",
        "role-selected-background-color",
        "role-selected-text-color",
        "role-text-color",
        "show-header",
        "show-role-tabs",
        "skeleton-base-color",
        "skeleton-highlight-color",
        "source-id",
        "source-prefix",
        "status-label",
        "success-accept-message",
        "success-reject-message",
        "success-withdraw-message",
        "sent-label",
        "sent-direction-label",
        "status-param",
        "sync-url",
        "text-color",
        "title",
        "toast-background-color",
        "toast-border-color",
        "toast-error-background-color",
        "toast-error-border-color",
        "toast-error-text-color",
        "toast-text-color",
        "whole-unit-prices",
        "withdraw-label",
        "withdraw-button-accent-color",
        "withdraw-button-background-color",
        "withdraw-button-border-color",
        "withdraw-button-text-color",
        ...statuses.map((status) => `label-${status}`),
        ...statuses.map((status) => `filter-label-${status}`),
    ];

    constructor() {
        super({ css: ":host { display: contents; }", template: "<slot></slot>" });
        this.role = "seller";
        this.status = "all";
        this.page = 1;
        this.total = 0;
        this.items = [];
        this.controller = null;
        this.loadScheduled = false;
        this.inFlight = null;
        this.lastLoadedKey = "";
    }

    connectedCallback() {
        super.connectedCallback();
        this.role = initialRole(this);
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("basic-pagination:change", this.onPageChange);
        this.addEventListener("click", this.onActionClick);
        this.readUrlState();
        this.syncPresentation();
        if (isFramed()) {
            this.showPreview();
        } else {
            this.scheduleLoad();
        }
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("basic-pagination:change", this.onPageChange);
        this.removeEventListener("click", this.onActionClick);
        this.controller?.abort();
        this.controller = null;
        this.inFlight = null;
        this.loadScheduled = false;
    }

    attributeChangedCallback(name) {
        if (!this.isConnected) {
            return;
        }
        if (name === "initial-role") {
            this.role = initialRole(this);
        }
        queueMicrotask(() => {
            this.syncPresentation();
            this.renderItems();
        });
        if (reloadAttributes.has(name) && !isFramed()) {
            this.page = 1;
            this.scheduleLoad();
        }
    }

    scheduleLoad(options = {}) {
        this.pendingLoadOptions = { ...(this.pendingLoadOptions || {}), ...options };
        if (this.loadScheduled) {
            return;
        }
        this.loadScheduled = true;
        queueMicrotask(() => {
            this.loadScheduled = false;
            const pending = this.pendingLoadOptions || {};
            this.pendingLoadOptions = null;
            if (this.isConnected) {
                void this.load(pending);
            }
        });
    }

    load({ silent = false, force = false } = {}) {
        const request = this.listRequest();
        if (!force && request.key === this.lastLoadedKey) {
            this.renderItems();
            return Promise.resolve();
        }
        if (this.inFlight?.key === request.key) {
            return this.inFlight.promise;
        }
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        if (!silent) {
            this.showLoading();
        }
        const promise = this.executeLoad(request, controller, silent);
        this.inFlight = { key: request.key, promise };
        return promise.finally(() => {
            if (this.inFlight?.promise === promise) {
                this.inFlight = null;
            }
        });
    }

    listRequest() {
        const pageSize = positiveInteger(this.getAttribute("page-size"), 12);
        const query = {
            ...(this.role === "all" ? {} : { role: this.role }),
            ...(this.status === "all" ? {} : { status: this.status }),
            limit: pageSize,
            offset: (this.page - 1) * pageSize,
        };
        const url = new URL(this.sourceUrl("myProposals"), this.ownerDocument.baseURI);
        for (const [name, value] of Object.entries(query)) {
            url.searchParams.set(name, String(value));
        }
        return { key: url.href, query };
    }

    async executeLoad(request, controller, silent) {
        try {
            const result = await this.requestSource("myProposals", {
                query: request.query,
                signal: controller.signal,
            });
            if (controller.signal.aborted) {
                return;
            }
            this.items = Array.isArray(result.items) ? result.items.filter(isProposal) : [];
            this.total = nonNegativeInteger(result.total, this.items.length);
            this.lastLoadedKey = request.key;
            this.renderItems();
        } catch (error) {
            if (controller.signal.aborted) {
                return;
            }
            if (!silent) {
                this.items = [];
                this.total = 0;
                this.renderItems();
            }
            this.showToast(
                errorMessage(error, this.getAttribute("error-message") || "Impossible de charger les offres de prix."),
                true,
            );
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
                viewerRole: this.role === "all" ? "seller" : this.role,
                offerSlug: "raquette-de-tennis",
                acceptedAt: null,
                checkoutStatus: null,
                agreementId: null,
                orderId: null,
            },
        ];
        this.total = 1;
        this.renderItems();
    }

    syncPresentation() {
        setText(this.querySelector("[data-title]"), this.getAttribute("title") || "Mes offres de prix");
        setText(
            this.querySelector("[data-copy]"),
            this.getAttribute("copy") || "Retrouve les propositions reçues et celles que tu as envoyées.",
        );
        setHidden(this.querySelector("[data-header]"), this.getAttribute("show-header") === "false");
        copyAttribute(this, this.querySelector("[data-layout]"), "text-color");

        const roleFilter = this.querySelector("[data-role-filter]");
        setHidden(roleFilter, this.getAttribute("show-role-tabs") === "false");
        setAttribute(roleFilter, "value", this.role);
        if (roleFilter.value !== this.role) {
            roleFilter.value = this.role;
        }
        const allChip = this.querySelector("[data-all-chip]");
        const receivedChip = this.querySelector("[data-received-chip]");
        const sentChip = this.querySelector("[data-sent-chip]");
        allChip.toggleAttribute("selected", this.role === "all");
        receivedChip.toggleAttribute("selected", this.role === "seller");
        sentChip.toggleAttribute("selected", this.role === "buyer");
        setText(allChip, this.getAttribute("combined-label") || "Toutes");
        setText(receivedChip, this.getAttribute("received-label") || "Offres reçues");
        setText(sentChip, this.getAttribute("sent-label") || "Offres envoyées");
        copyColors(this, roleFilter, "role", [
            "accent-color",
            "text-color",
            "background-color",
            "border-color",
            "selected-background-color",
            "selected-text-color",
        ]);

        const statusFilter = this.querySelector("[data-status-filter]");
        statusFilter.removeAttribute("label");
        setAttribute(statusFilter, "accessible-label", this.getAttribute("status-label") || "Filtrer par statut");
        setAttribute(statusFilter, "value", this.status);
        copyColors(this, statusFilter, "field", ["accent-color", "text-color", "background-color", "border-color"]);
        for (const option of statusFilter?.querySelectorAll("basic-option") ?? []) {
            setText(option, this.filterLabel(option.getAttribute("value")));
        }

        const grid = this.querySelector("[data-items]");
        setAttribute(grid, "min", this.getAttribute("grid-min") || "md");
        setAttribute(grid, "max", this.getAttribute("grid-max") || "xl");
        setAttribute(grid, "gap", this.getAttribute("grid-gap") || "md");
        setAttribute(grid, "packing", this.getAttribute("grid-packing") === "fill" ? "fill" : "fit");
        setAttribute(grid, "justify-items", "stretch");
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
        if (!grid || !itemTemplate) {
            return;
        }
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
            setText(
                fragment.querySelector("[data-direction]"),
                proposal.viewerRole === "buyer"
                    ? this.getAttribute("sent-direction-label") || "Offre envoyée"
                    : this.getAttribute("received-direction-label") || "Offre reçue",
            );
            this.syncOfferLink(fragment, proposal);
            this.syncOfferImage(fragment, proposal);
            setText(
                fragment.querySelector("[data-proposed-label]"),
                this.getAttribute("proposed-label") || "Prix proposé",
            );
            setText(
                fragment.querySelector("[data-proposed-amount]"),
                this.formatMoney(proposal.proposedAmount, proposal.currency),
            );
            setText(
                fragment.querySelector("[data-reference-label]"),
                this.getAttribute("reference-label") || "Prix initial",
            );
            setText(
                fragment.querySelector("[data-reference-amount]"),
                this.formatMoney(proposal.referenceAmount, proposal.currency),
            );
            setHidden(
                fragment.querySelector("[data-reference-group]"),
                this.getAttribute("show-reference-price") === "false",
            );

            const message = fragment.querySelector("[data-message]");
            setHidden(message, this.getAttribute("show-message") === "false" || !proposal.buyerMessage);
            setText(message, proposal.buyerMessage ? `“${proposal.buyerMessage}”` : "");
            const expiration = fragment.querySelector("[data-expiration]");
            setHidden(
                expiration,
                this.getAttribute("show-expiration") === "false" ||
                    proposal.status !== "pending" ||
                    !proposal.expiresAt,
            );
            setText(expiration, proposal.expiresAt ? this.formatExpiration(proposal.expiresAt) : "");
            const decision = fragment.querySelector("[data-decision]");
            const decisionValue = this.decisionDate(proposal);
            setHidden(decision, !decisionValue);
            setText(decision, decisionValue ? this.formatDecision(proposal.status, decisionValue) : "");
            const checkoutExpiration = fragment.querySelector("[data-checkout-expiration]");
            const hasCheckoutExpiration =
                proposal.status === "accepted" &&
                proposal.checkoutStatus === "active" &&
                typeof proposal.checkoutExpiresAt === "string";
            setHidden(checkoutExpiration, !hasCheckoutExpiration);
            setText(
                checkoutExpiration,
                hasCheckoutExpiration ? this.formatCheckoutExpiration(proposal.checkoutExpiresAt) : "",
            );

            const canDecide = proposal.status === "pending" && proposal.viewerRole === "seller";
            const canWithdraw = proposal.status === "pending" && proposal.viewerRole === "buyer";
            const accept = fragment.querySelector('[data-action="accept"]');
            const reject = fragment.querySelector('[data-action="reject"]');
            const withdraw = fragment.querySelector('[data-action="withdraw"]');
            setHidden(accept, !canDecide);
            setHidden(reject, !canDecide);
            setHidden(withdraw, !canWithdraw);
            setText(accept, this.getAttribute("accept-label") || "Accepter");
            setText(reject, this.getAttribute("reject-label") || "Refuser");
            setText(withdraw, this.getAttribute("withdraw-label") || "Retirer");
            this.syncActionTheme(accept, "accept");
            this.syncActionTheme(reject, "reject");
            this.syncActionTheme(withdraw, "withdraw");
            this.syncCheckoutActions(fragment, proposal);
            grid.append(fragment);
        }

        setHidden(this.querySelector("[data-loading]"), true);
        setHidden(grid, this.items.length === 0);
        const empty = this.querySelector("[data-empty-state]");
        setHidden(empty, this.items.length !== 0);
        copyColors(this, empty, "card", ["text-color", "background-color", "border-color", "muted-text-color"]);
        const unfiltered = this.status === "all";
        setText(
            this.querySelector("[data-empty-title]"),
            unfiltered
                ? this.getAttribute("empty-title") ||
                      (this.role === "all"
                          ? "Aucune offre pour le moment"
                          : this.role === "seller"
                            ? "Aucune offre reçue pour le moment"
                            : "Aucune offre envoyée pour le moment")
                : this.getAttribute("empty-filtered-title") || "Aucune offre avec ce statut",
        );
        setText(
            this.querySelector("[data-empty-message]"),
            unfiltered
                ? this.getAttribute("empty-message") ||
                      (this.role === "all"
                          ? "Les offres reçues et envoyées apparaîtront ici."
                          : this.role === "seller"
                            ? "Les propositions envoyées par les acheteurs apparaîtront ici."
                            : "Les propositions que tu envoies apparaîtront ici.")
                : this.getAttribute("empty-filtered-message") || "Essaie un autre statut pour retrouver tes offres.",
        );
        const pagination = this.querySelector("[data-pagination]");
        setAttribute(pagination, "page", String(this.page));
        setAttribute(pagination, "total", String(this.total));
        setHidden(pagination, this.total <= positiveInteger(this.getAttribute("page-size"), 12));
    }

    onFilterChange = (event) => {
        if (event.target?.matches?.("[data-role-filter]")) {
            const role = event.target.value;
            if (!roles.includes(role)) {
                return;
            }
            this.role = role;
        } else if (event.target?.matches?.("[data-status-filter]")) {
            const status = String(event.target.value || "all");
            if (!statuses.includes(status)) {
                return;
            }
            this.status = status;
        } else {
            return;
        }
        this.page = 1;
        this.writeUrlState();
        this.syncPresentation();
        if (isFramed()) {
            this.showPreview();
        } else {
            this.scheduleLoad();
        }
    };

    onPageChange = (event) => {
        if (!event.target?.matches?.("[data-pagination]")) {
            return;
        }
        this.page = positiveInteger(event.detail?.page, 1);
        this.writeUrlState();
        this.scheduleLoad();
        this.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    readUrlState() {
        if (this.getAttribute("sync-url") === "false" || typeof location === "undefined") {
            return;
        }
        const params = new URLSearchParams(location.search);
        const role = params.get(this.getAttribute("role-param") || "role");
        const status = params.get(this.getAttribute("status-param") || "status");
        if (roles.includes(role)) {
            this.role = role;
        }
        if (status && statuses.includes(status)) {
            this.status = status;
        }
        this.page = positiveInteger(params.get(this.getAttribute("page-param") || "page"), 1);
    }

    writeUrlState() {
        if (
            this.getAttribute("sync-url") === "false" ||
            typeof location === "undefined" ||
            typeof history === "undefined"
        ) {
            return;
        }
        const url = new URL(location.href);
        const roleParam = this.getAttribute("role-param") || "role";
        const statusParam = this.getAttribute("status-param") || "status";
        const pageParam = this.getAttribute("page-param") || "page";
        const defaultRole = initialRole(this);
        if (this.role === defaultRole) {
            url.searchParams.delete(roleParam);
        } else {
            url.searchParams.set(roleParam, this.role);
        }
        if (this.status === "all") {
            url.searchParams.delete(statusParam);
        } else {
            url.searchParams.set(statusParam, this.status);
        }
        if (this.page <= 1) {
            url.searchParams.delete(pageParam);
        } else {
            url.searchParams.set(pageParam, String(this.page));
        }
        history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }

    onActionClick = (event) => {
        const button = event
            .composedPath()
            .find((node) => node instanceof HTMLElement && node.matches?.("[data-action]"));
        if (!button || button.disabled) {
            return;
        }
        const card = button.closest("[data-proposal-card]");
        const proposal = this.items.find((item) => String(item.id) === card?.dataset.proposalId);
        if (!proposal) {
            return;
        }
        if (!this.confirmAction(button.dataset.action, proposal)) {
            return;
        }
        void this.performAction(proposal, button.dataset.action, card);
    };

    async performAction(proposal, action, card) {
        if (!["accept", "reject", "withdraw"].includes(action)) {
            return;
        }
        const buttons = Array.from(card.querySelectorAll("[data-action]"));
        for (const button of buttons) {
            button.disabled = true;
        }
        try {
            const updated =
                action === "withdraw"
                    ? await this.requestSource("withdrawMyProposal", {
                          method: "POST",
                          body: { id: proposal.id, expectedVersion: proposal.version },
                      })
                    : await this.requestSource("respondToProposal", {
                          method: "POST",
                          body: { id: proposal.id, expectedVersion: proposal.version, action },
                      });
            const index = this.items.findIndex((item) => item.id === proposal.id);
            if (index >= 0 && isProposal(updated)) {
                this.items[index] = updated;
            }
            this.renderItems();
            const message =
                action === "accept"
                    ? this.getAttribute("success-accept-message") || "L’offre a été acceptée."
                    : action === "reject"
                      ? this.getAttribute("success-reject-message") || "L’offre a été refusée."
                      : this.getAttribute("success-withdraw-message") || "Ton offre a été retirée.";
            this.showToast(message, false);
            const eventName = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "withdrawn";
            this.dispatchEvent(
                new CustomEvent(`commerce-negotiation:${eventName}`, {
                    bubbles: true,
                    composed: true,
                    detail: updated,
                }),
            );
            if (!isFramed()) {
                this.scheduleLoad({ silent: true, force: true });
            }
        } catch (error) {
            for (const button of buttons) {
                button.disabled = false;
            }
            this.showToast(
                errorMessage(error, this.getAttribute("error-message") || "Impossible de mettre à jour cette offre."),
                true,
            );
        }
    }

    async requestSource(endpoint, options = {}) {
        const url = new URL(this.sourceUrl(endpoint), this.ownerDocument.baseURI);
        for (const [name, value] of Object.entries(options.query || {})) {
            url.searchParams.set(name, String(value));
        }
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
        if (!response.ok) {
            throw new Error(
                body && typeof body.error === "string" ? body.error : `${response.status} ${response.statusText}`,
            );
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("Réponse invalide du service.");
        }
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

    filterLabel(status) {
        const code = statuses.includes(status) ? status : "pending";
        return this.getAttribute(`filter-label-${code}`) || defaultFilterLabels[code];
    }

    syncOfferLink(fragment, proposal) {
        const link = fragment.querySelector("[data-offer-title-link]");
        const media = fragment.querySelector("[data-offer-media]");
        const href = buildUrl(
            this.getAttribute("offer-url") || "/annonce",
            this.getAttribute("offer-param") || "slug",
            proposal.offerSlug,
        );
        for (const target of [link, media]) {
            setAttribute(target, "href", href);
            setAttribute(target, "aria-label", `Voir l’annonce ${proposal.offerTitle}`);
        }
    }

    syncOfferImage(fragment, proposal) {
        const image = fragment.querySelector("[data-offer-image]");
        const placeholder = fragment.querySelector("[data-offer-placeholder]");
        const mediaId = positiveInteger(proposal.offerMainImageMediaId ?? proposal.mainImageMediaId);
        const sourceWidth = positiveInteger(proposal.offerMainImageWidth ?? proposal.mainImageWidth);
        const sourceHeight = positiveInteger(proposal.offerMainImageHeight ?? proposal.mainImageHeight);
        setHidden(image, !mediaId);
        setHidden(placeholder, Boolean(mediaId));
        if (!mediaId) {
            image?.removeAttribute("data-cms-src");
            image?.removeAttribute("data-source-image-access");
            image?.removeAttribute("data-source-width");
            image?.removeAttribute("data-source-height");
            return;
        }
        const prefix = (this.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
        const sourceId = encodeURIComponent(this.getAttribute("commerce-source-id") || "commerce");
        const endpointId = this.getAttribute("image-endpoint") || "publicOfferImage";
        const endpoint = encodeURIComponent(endpointId);
        setAttribute(
            image,
            "data-cms-src",
            `${prefix}/${sourceId}/${endpoint}?id=${encodeURIComponent(String(mediaId))}`,
        );
        if (endpointId === "publicOfferImage") {
            setAttribute(image, "data-source-image-access", "public");
        } else {
            image?.removeAttribute("data-source-image-access");
        }
        setOptionalPositiveInteger(image, "data-source-width", sourceWidth);
        setOptionalPositiveInteger(image, "data-source-height", sourceHeight);
        setAttribute(image, "alt", proposal.offerTitle);
    }

    syncActionTheme(button, action) {
        const wrapper = button?.closest("basic-button");
        copyColors(this, wrapper, "button", ["accent-color", "text-color", "background-color", "border-color"]);
        copyColors(this, wrapper, `${action}-button`, [
            "accent-color",
            "text-color",
            "background-color",
            "border-color",
        ]);
    }

    syncCheckoutActions(fragment, proposal) {
        const checkout = fragment.querySelector('[data-action-link="checkout"]');
        const order = fragment.querySelector('[data-action-link="order"]');
        const agreementId = typeof proposal.agreementId === "string" ? proposal.agreementId.trim() : "";
        const buyerAccepted =
            proposal.viewerRole === "buyer" &&
            proposal.status === "accepted" &&
            proposal.checkoutStatus === "active" &&
            Boolean(agreementId);
        setHidden(checkout, !buyerAccepted);
        if (buyerAccepted) {
            setAttribute(
                checkout,
                "href",
                buildUrl(
                    this.getAttribute("checkout-url") || "/checkout",
                    this.getAttribute("checkout-param") || "agreementId",
                    agreementId,
                ),
            );
            const template = this.getAttribute("checkout-label-template") || "Finaliser l’achat — {amount}";
            setText(
                checkout,
                template.replaceAll("{amount}", this.formatMoney(proposal.proposedAmount, proposal.currency)),
            );
            this.syncActionTheme(checkout, "accept");
        }

        const consumed =
            proposal.viewerRole === "buyer" &&
            proposal.status === "accepted" &&
            proposal.checkoutStatus === "consumed" &&
            proposal.orderId !== null &&
            proposal.orderId !== undefined;
        setHidden(order, !consumed);
        if (consumed) {
            setAttribute(
                order,
                "href",
                buildUrl(
                    this.getAttribute("order-url") || "/mon-espace/commande",
                    this.getAttribute("order-param") || "orderId",
                    proposal.orderId,
                ),
            );
            setText(order, this.getAttribute("order-label") || "Voir ma commande");
        }
    }

    decisionDate(proposal) {
        if (proposal.status === "accepted") {
            return proposal.acceptedAt;
        }
        if (proposal.status === "rejected") {
            return proposal.rejectedAt;
        }
        if (proposal.status === "withdrawn") {
            return proposal.withdrawnAt;
        }
        return ["expired", "superseded", "canceled"].includes(proposal.status) ? proposal.updatedAt : null;
    }

    confirmAction(action, proposal) {
        const messages = {
            accept:
                this.getAttribute("confirm-accept-message") ||
                `Accepter l’offre de ${this.formatMoney(proposal.proposedAmount, proposal.currency)} ?`,
            reject: this.getAttribute("confirm-reject-message") || "Refuser définitivement cette offre ?",
            withdraw: this.getAttribute("confirm-withdraw-message") || "Retirer cette offre ?",
        };
        return (
            typeof window === "undefined" || typeof window.confirm !== "function" || window.confirm(messages[action])
        );
    }

    formatMoney(amount, currency) {
        try {
            return new Intl.NumberFormat(this.getAttribute("locale") || "fr-FR", {
                style: "currency",
                currency: currency.toUpperCase(),
                minimumFractionDigits: this.getAttribute("whole-unit-prices") === "true" ? 0 : undefined,
                maximumFractionDigits: this.getAttribute("whole-unit-prices") === "true" ? 0 : undefined,
            }).format(amount / 100);
        } catch {
            const value =
                this.getAttribute("whole-unit-prices") === "true" ? String(amount / 100) : (amount / 100).toFixed(2);
            return `${value} ${currency.toUpperCase()}`;
        }
    }

    formatExpiration(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        const label = this.getAttribute("expiration-label") || "Expire le {date}";
        const formatted = new Intl.DateTimeFormat(this.getAttribute("locale") || "fr-FR", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(date);
        return label.replaceAll("{date}", formatted);
    }

    formatDecision(status, value) {
        const date = this.formatDateTime(value);
        const template = this.getAttribute("decision-label-template") || "{status} le {date}";
        return template.replaceAll("{status}", this.statusLabel(status)).replaceAll("{date}", date);
    }

    formatCheckoutExpiration(value) {
        const date = this.formatDateTime(value);
        const template = this.getAttribute("checkout-expiration-label") || "Paiement disponible jusqu’au {date}";
        return template.replaceAll("{date}", date);
    }

    formatDateTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        return new Intl.DateTimeFormat(this.getAttribute("locale") || "fr-FR", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(date);
    }

    showLoading() {
        setHidden(this.querySelector("[data-loading]"), false);
        setHidden(this.querySelector("[data-items]"), true);
        setHidden(this.querySelector("[data-empty-state]"), true);
        setHidden(this.querySelector("[data-pagination]"), true);
    }

    showToast(message, error) {
        const toast =
            this.querySelector("[data-toast-template]")?.content.firstElementChild?.cloneNode(true) ??
            this.ownerDocument.createElement("basic-toast");
        toast.setAttribute("role", error ? "alert" : "status");
        toast.textContent = message;
        const prefix = error ? "toast-error" : "toast";
        copyColors(this, toast, prefix, ["text-color", "background-color", "border-color"]);
        this.querySelector("[data-toast-region]")?.replaceChildren(toast);
    }
}

function isProposal(value) {
    return (
        value &&
        typeof value === "object" &&
        Number.isSafeInteger(value.id) &&
        typeof value.offerTitle === "string" &&
        Number.isSafeInteger(value.proposedAmount) &&
        Number.isSafeInteger(value.referenceAmount) &&
        typeof value.currency === "string" &&
        statuses.includes(value.status) &&
        Number.isSafeInteger(value.version)
    );
}

function buildUrl(base, parameter, value) {
    const stringValue = String(value ?? "").trim();
    if (!stringValue) {
        return base;
    }
    const url = new URL(base, "https://cms.invalid");
    url.searchParams.set(parameter, stringValue);
    return `${url.pathname}${url.search}${url.hash}`;
}

function positiveInteger(value, fallback = null) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function initialRole(element) {
    const value = element.getAttribute("initial-role");
    return roles.includes(value) ? value : "seller";
}

function nonNegativeInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function setText(element, value) {
    if (element && element.textContent !== value) {
        element.textContent = value;
    }
}

function setAttribute(element, name, value) {
    if (element && element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

function setOptionalPositiveInteger(element, name, value) {
    if (!element) {
        return;
    }
    if (value === null) {
        element.removeAttribute(name);
        return;
    }
    setAttribute(element, name, String(value));
}

function copyAttribute(source, target, sourceName, targetName = sourceName) {
    if (!target) {
        return;
    }
    const value = source.getAttribute(sourceName)?.trim();
    if (value) {
        target.setAttribute(targetName, value);
    } else {
        target.removeAttribute(targetName);
    }
}

function copyColors(source, target, prefix, names) {
    for (const name of names) {
        copyAttribute(source, target, `${prefix}-${name}`, name);
    }
}

function setHidden(element, hidden) {
    if (!element) {
        return;
    }
    element.toggleAttribute("hidden", hidden);
    if (hidden) {
        element.style.setProperty("display", "none", "important");
    } else {
        element.style.removeProperty("display");
    }
}

function errorMessage(error, fallback) {
    console.error(error);
    const message = error instanceof Error ? error.message.trim() : "";
    return isFrenchUserMessage(message) ? message : fallback;
}

function isFrenchUserMessage(value) {
    return (
        Boolean(value) &&
        /[àâçéèêëîïôùûüÿœ]|\b(?:le|la|les|un|une|des|du|de|au|aux|ton|ta|tes|votre|vos|offre|prix|montant|proposition|conditions|annonce|réponse)\b/i.test(
            value,
        )
    );
}

function isFramed() {
    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceNegotiationList);

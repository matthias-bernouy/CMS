const PARAM_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;

export class SalesProposalList extends HTMLElement {
    static observedAttributes = [
        "cursor-state",
        "edit-path",
        "locale",
        "new-path",
        "page-size",
        "proposal-param",
        "query-param",
        "source-id",
        "source-prefix",
        "status-param",
    ];

    observer = null;

    connectedCallback() {
        this.addEventListener("click", this.onClick);
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("input", this.onFilterChange);
        this.observer = new MutationObserver(() => this.syncPresentation());
        this.observer.observe(this, { childList: true, subtree: true });
        this.syncSource();
        this.syncPresentation();
    }

    disconnectedCallback() {
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("input", this.onFilterChange);
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.syncSource();
            this.syncPresentation();
        }
    }

    onClick = (event) => {
        const target = event.target instanceof Element ? event.target.closest("[data-sales-proposal-next]") : null;
        if (!target || !this.contains(target)) {
            return;
        }
        const cursor = target.getAttribute("data-cursor")?.trim() ?? "";
        if (!cursor || cursor.includes("{{")) {
            return;
        }
        const control = this.querySelector("[data-sales-cursor-state]");
        if (!control) {
            return;
        }
        control.value = cursor;
        control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    };

    onFilterChange = (event) => {
        const control = eventControl(event, this);
        if (!control || !this.isFilterControl(control)) {
            return;
        }
        this.resetCursor();
        this.syncEmptyState();
    };

    isFilterControl(control) {
        const parameter = control.getAttribute("cms-param-sync")?.trim();
        return (
            parameter === parameterName(this.getAttribute("query-param"), "salesProposalQuery") ||
            parameter === parameterName(this.getAttribute("status-param"), "salesProposalStatus")
        );
    }

    resetCursor() {
        const control = this.querySelector("[data-sales-cursor-state]");
        if (!control || String(control.value || "") === "") {
            return;
        }
        control.value = "";
        control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    syncSource() {
        const query = parameterName(this.getAttribute("query-param"), "salesProposalQuery");
        const status = parameterName(this.getAttribute("status-param"), "salesProposalStatus");
        const cursor = parameterName(this.getAttribute("cursor-state"), "salesProposalCursor");
        const limit = positiveInteger(this.getAttribute("page-size"), 20);
        const source = `${sourceBase(this)}/listMyProposals?q=#{${query}}&status=#{${status}}&cursor=@{${cursor}}&limit=${limit} as proposals`;
        setAttributeIfChanged(this, "cms-source", source);
        setAttributeIfChanged(this, "cms-reload-on", "sales-proposals:changed");
    }

    syncPresentation() {
        const cursor = parameterName(this.getAttribute("cursor-state"), "salesProposalCursor");
        for (const control of this.querySelectorAll("[data-sales-cursor-state]")) {
            setAttributeIfChanged(control, "cms-page-state", cursor);
        }
        const newPath = configuredPath(this.getAttribute("new-path"), "/proposals/new");
        for (const link of this.querySelectorAll("[data-sales-proposal-start]")) {
            setAttributeIfChanged(link, "href", newPath);
        }
        const editPath = configuredPath(this.getAttribute("edit-path"), "/proposals/edit");
        const proposalParam = parameterName(this.getAttribute("proposal-param"), "proposalId");
        for (const link of this.querySelectorAll("[data-sales-proposal-link]")) {
            const proposalId = link.getAttribute("data-proposal-id")?.trim() || "";
            if (!proposalId || proposalId.includes("{{")) {
                link.removeAttribute("href");
                continue;
            }
            setAttributeIfChanged(link, "href", hrefWithParameter(editPath, proposalParam, proposalId));
        }
        this.syncEmptyState();
        formatMoney(this, this.getAttribute("locale") || this.ownerDocument.documentElement.lang || "en");
    }

    syncEmptyState() {
        const filtered = this.hasActiveFilters();
        for (const element of this.querySelectorAll("[data-sales-empty-unfiltered]")) {
            element.toggleAttribute("hidden", filtered);
        }
        for (const element of this.querySelectorAll("[data-sales-empty-filtered]")) {
            element.toggleAttribute("hidden", !filtered);
        }
    }

    hasActiveFilters() {
        const query = parameterName(this.getAttribute("query-param"), "salesProposalQuery");
        const status = parameterName(this.getAttribute("status-param"), "salesProposalStatus");
        return [...this.querySelectorAll("[cms-param-sync]")].some((control) => {
            const parameter = control.getAttribute("cms-param-sync")?.trim();
            return (parameter === query || parameter === status) && controlValue(control) !== "";
        });
    }
}

function sourceBase(host) {
    const prefix = (host.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
    const id = encodeURIComponent(host.getAttribute("source-id")?.trim() || "sales-configurator");
    return `${prefix}/${id}`;
}

function parameterName(value, fallback) {
    const candidate = value?.trim() || "";
    return PARAM_NAME.test(candidate) ? candidate : fallback;
}

function configuredPath(value, fallback) {
    const candidate = value?.trim() || "";
    return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : fallback;
}

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function eventControl(event, host) {
    for (const candidate of event.composedPath()) {
        if (candidate instanceof Element && host.contains(candidate) && candidate.hasAttribute("cms-param-sync")) {
            return candidate;
        }
    }
    return null;
}

function controlValue(control) {
    return String("value" in control ? (control.value ?? "") : (control.getAttribute("value") ?? "")).trim();
}

function hrefWithParameter(path, parameter, value) {
    const hashIndex = path.indexOf("#");
    const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
    const pathAndQuery = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
    const queryIndex = pathAndQuery.indexOf("?");
    const pathname = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
    const parameters = new URLSearchParams(queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : "");
    parameters.set(parameter, value);
    const query = parameters.toString();
    return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

function formatMoney(root, locale) {
    for (const element of root.querySelectorAll("[data-sales-money]")) {
        const amount = element.getAttribute("data-amount-cents")?.trim() || "";
        const currency = element.getAttribute("data-currency")?.trim().toUpperCase() || "EUR";
        if (!amount || amount.includes("{{")) {
            continue;
        }
        const cents = Number(amount);
        if (Number.isFinite(cents)) {
            let formatted;
            try {
                formatted = new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
            } catch {
                formatted = `${(cents / 100).toFixed(2)} ${currency}`;
            }
            if (element.textContent !== formatted) {
                element.textContent = formatted;
            }
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SalesProposalList);

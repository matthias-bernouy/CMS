export class SalesCatalogBrowser extends HTMLElement {
    static observedAttributes = ["locale", "source-id", "source-prefix"];

    observer = null;
    syncQueued = false;

    connectedCallback() {
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("input", this.onFilterChange);
        this.observer = new MutationObserver(() => this.queueSync());
        this.observer.observe(this, { childList: true, subtree: true });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("input", this.onFilterChange);
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    onFilterChange = (event) => {
        const control = eventControl(this, event);
        if (control) {
            this.syncPresentation();
        }
    };

    queueSync() {
        if (this.syncQueued) {
            return;
        }
        this.syncQueued = true;
        queueMicrotask(() => {
            this.syncQueued = false;
            if (this.isConnected) {
                this.syncPresentation();
            }
        });
    }

    sync() {
        setAttributeIfChanged(this, "cms-source", `${sourceBase(this)}/getPartnerCatalog as catalogData`);
        this.syncPresentation();
    }

    syncPresentation() {
        formatMoney(this, this.getAttribute("locale") || this.ownerDocument.documentElement.lang || "fr-FR");
        indentServices(this);
        filterRows(this);
    }
}

function sourceBase(host) {
    const prefix = (host.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
    const id = encodeURIComponent(host.getAttribute("source-id")?.trim() || "sales-configurator");
    return `${prefix}/${id}`;
}

function eventControl(host, event) {
    for (const candidate of event.composedPath()) {
        if (
            candidate instanceof Element &&
            host.contains(candidate) &&
            (candidate.hasAttribute("data-sales-catalog-query") || candidate.hasAttribute("data-sales-catalog-status"))
        ) {
            return candidate;
        }
    }
    return null;
}

function controlValue(control) {
    if (!control) {
        return "";
    }
    return String("value" in control ? (control.value ?? "") : (control.getAttribute("value") ?? "")).trim();
}

function filterRows(root) {
    const query = searchValue(controlValue(root.querySelector("[data-sales-catalog-query]")));
    const status = controlValue(root.querySelector("[data-sales-catalog-status]")).toLocaleLowerCase();
    const rows = [...root.querySelectorAll("[data-sales-catalog-row]")];
    let visible = 0;

    for (const row of rows) {
        const rowStatus = (row.getAttribute("data-availability") || "").trim().toLocaleLowerCase();
        const matchesQuery = !query || searchValue(row.textContent || "").includes(query);
        const matchesStatus = !status || rowStatus === status;
        const matches = matchesQuery && matchesStatus;
        row.toggleAttribute("hidden", !matches);
        if (matches) {
            visible += 1;
        }
    }

    const active = Boolean(query || status);
    for (const empty of root.querySelectorAll("[data-sales-catalog-filter-empty]")) {
        empty.toggleAttribute("hidden", !active || rows.length === 0 || visible > 0);
    }
    for (const output of root.querySelectorAll("[data-sales-catalog-result-count]")) {
        const count = active ? visible : rows.length;
        const label = `${count} service${count === 1 ? "" : "s"} affiché${count === 1 ? "" : "s"}`;
        if (output.textContent !== label) {
            output.textContent = label;
        }
    }
}

function searchValue(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase();
}

function indentServices(root) {
    for (const service of root.querySelectorAll("[data-sales-catalog-service]")) {
        const parsed = Number.parseInt(service.getAttribute("data-depth") || "0", 10);
        const depth = Number.isInteger(parsed) ? Math.min(Math.max(parsed, 0), 2) : 0;
        service.style.paddingInlineStart = `${depth * 1.25}rem`;
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
        if (!Number.isFinite(cents)) {
            continue;
        }
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

function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SalesCatalogBrowser);

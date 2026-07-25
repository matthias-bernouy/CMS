export class SalesCatalogBrowser extends HTMLElement {
    static observedAttributes = ["locale", "source-id", "source-prefix"];

    observer = null;
    syncQueued = false;
    expandedModuleIds = new Set();

    connectedCallback() {
        this.addEventListener("change", this.onFilterChange);
        this.addEventListener("click", this.onClick);
        this.addEventListener("input", this.onFilterChange);
        this.observer = new MutationObserver((records) => {
            if (records.some((record) => !presentationMutation(record))) {
                this.queueSync();
            }
        });
        this.observer.observe(this, { childList: true, subtree: true });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onFilterChange);
        this.removeEventListener("click", this.onClick);
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

    onClick = (event) => {
        const toggle = closestWithin(this, event.target, "[data-sales-module-toggle]");
        if (!toggle) {
            return;
        }
        event.preventDefault();
        if (toggle.hasAttribute("hidden")) {
            return;
        }
        const moduleId = toggle.getAttribute("data-module-id") || "";
        if (!moduleId) {
            return;
        }
        if (this.expandedModuleIds.has(moduleId)) {
            this.expandedModuleIds.delete(moduleId);
        } else {
            this.expandedModuleIds.add(moduleId);
        }
        this.syncPresentation();
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
        syncModuleCounts(this);
        filterRows(this, this.expandedModuleIds);
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

function filterRows(root, expandedModuleIds) {
    const query = searchValue(controlValue(root.querySelector("[data-sales-catalog-query]")));
    const status = controlValue(root.querySelector("[data-sales-catalog-status]")).toLocaleLowerCase();
    const rows = [...root.querySelectorAll("[data-sales-catalog-row]")];
    const active = Boolean(query || status);
    const moduleRows = new Map();
    const variantRows = new Map();
    const ownQueryMatches = new Map();

    for (const row of rows) {
        const moduleId = row.getAttribute("data-sales-module-id") || "";
        const variantId = row.getAttribute("data-sales-variant-id") || "";
        const kind = row.getAttribute("data-sales-row-kind") || "";
        if (kind === "module") {
            moduleRows.set(moduleId, row);
        } else if (kind === "variant") {
            variantRows.set(`${moduleId}:${variantId}`, row);
        }
        ownQueryMatches.set(row, !query || rowSearchValue(row).includes(query));
    }

    const directMatches = new Set();
    for (const row of rows) {
        const moduleId = row.getAttribute("data-sales-module-id") || "";
        const variantId = row.getAttribute("data-sales-variant-id") || "";
        const kind = row.getAttribute("data-sales-row-kind") || "";
        const moduleMatches = ownQueryMatches.get(moduleRows.get(moduleId)) === true;
        const variantMatches = ownQueryMatches.get(variantRows.get(`${moduleId}:${variantId}`)) === true;
        const matchesQuery =
            ownQueryMatches.get(row) === true || moduleMatches || (kind === "feature" && variantMatches);
        const rowStatus = (row.getAttribute("data-sales-availability") || "").trim().toLocaleLowerCase();
        if (matchesQuery && (!status || rowStatus === status)) {
            directMatches.add(row);
        }
    }

    const usefulRows = new Set();
    const forcedExpandedModuleIds = new Set();
    if (active) {
        for (const row of directMatches) {
            usefulRows.add(row);
            const moduleId = row.getAttribute("data-sales-module-id") || "";
            const variantId = row.getAttribute("data-sales-variant-id") || "";
            const moduleRow = moduleRows.get(moduleId);
            if (moduleRow) {
                usefulRows.add(moduleRow);
            }
            if (row.getAttribute("data-sales-row-kind") === "feature") {
                const variantRow = variantRows.get(`${moduleId}:${variantId}`);
                if (variantRow) {
                    usefulRows.add(variantRow);
                }
            }
            if (row.getAttribute("data-sales-row-kind") !== "module") {
                forcedExpandedModuleIds.add(moduleId);
            }
        }
    }

    for (const row of rows) {
        const moduleId = row.getAttribute("data-sales-module-id") || "";
        const kind = row.getAttribute("data-sales-row-kind") || "";
        const visible = active ? usefulRows.has(row) : kind === "module" || expandedModuleIds.has(moduleId);
        row.toggleAttribute("hidden", !visible);
    }

    for (const [moduleId, row] of moduleRows) {
        syncModuleToggle(row, active ? forcedExpandedModuleIds.has(moduleId) : expandedModuleIds.has(moduleId), active);
    }

    const visible = rows.filter((row) => !row.hidden).length;
    for (const empty of root.querySelectorAll("[data-sales-catalog-filter-empty]")) {
        empty.toggleAttribute("hidden", !active || rows.length === 0 || visible > 0);
    }
    for (const output of root.querySelectorAll("[data-sales-catalog-result-count]")) {
        const count = visible;
        const label = `${count} service${count === 1 ? "" : "s"} affiché${count === 1 ? "" : "s"}`;
        if (output.textContent !== label) {
            output.textContent = label;
        }
    }
}

function rowSearchValue(row) {
    return searchValue(`${row.getAttribute("data-sales-search-text") || ""} ${row.textContent || ""}`);
}

function searchValue(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase();
}

function syncModuleCounts(root) {
    const rows = [...root.querySelectorAll("[data-sales-catalog-row]")];
    const modules = new Map();
    for (const row of rows) {
        const moduleId = row.getAttribute("data-sales-module-id") || "";
        const kind = row.getAttribute("data-sales-row-kind") || "";
        const entry = modules.get(moduleId) || { moduleRow: null, variants: 0, features: 0 };
        if (kind === "module") {
            entry.moduleRow = row;
        } else if (kind === "variant") {
            entry.variants += 1;
        } else if (kind === "feature") {
            entry.features += 1;
        }
        modules.set(moduleId, entry);
    }
    for (const { moduleRow, variants, features } of modules.values()) {
        if (!moduleRow) {
            continue;
        }
        const output = moduleRow.querySelector("[data-sales-module-counts]");
        if (!output) {
            continue;
        }
        const variantLabel = output.getAttribute(
            variants === 1 ? "data-sales-variant-singular" : "data-sales-variant-plural",
        );
        const featureLabel = output.getAttribute(
            features === 1 ? "data-sales-feature-singular" : "data-sales-feature-plural",
        );
        const label = `${variants} ${variantLabel || "variants"} · ${features} ${featureLabel || "features"}`;
        if (output.textContent !== label) {
            output.textContent = label;
        }
    }
}

function syncModuleToggle(row, expanded, filtering) {
    const toggle = row.querySelector("[data-sales-module-toggle]");
    if (!toggle) {
        return;
    }
    toggle.toggleAttribute("hidden", filtering);
    toggle.setAttribute("aria-expanded", String(expanded));
    const attribute = expanded ? "data-sales-expanded-label" : "data-sales-collapsed-label";
    const label = toggle.getAttribute(attribute) || (expanded ? "Collapse" : "Expand");
    const output = toggle.querySelector("[data-sales-module-toggle-label]");
    if (output && output.textContent !== label) {
        output.textContent = label;
    }
}

function closestWithin(host, target, selector) {
    const match = target instanceof Element ? target.closest(selector) : null;
    return match && host.contains(match) ? match : null;
}

function presentationMutation(record) {
    return (
        record.target instanceof Element &&
        Boolean(
            record.target.closest("[data-sales-money], [data-sales-module-counts], [data-sales-module-toggle-label]"),
        )
    );
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

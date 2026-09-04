import { prepareDraftPayload } from "./formPayload";
import { formatMoney } from "./presentation";

const PARAM_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;
const REFRESH_EVENT = "sales-proposals:changed";

export class SalesProposalBuilder extends HTMLElement {
    static observedAttributes = [
        "locale",
        "proposal-param",
        "share-path",
        "share-token-param",
        "source-id",
        "source-prefix",
    ];

    observer = null;
    syncQueued = false;
    catalogQuery = "";
    expandedModuleIds = new Set();

    connectedCallback() {
        this.addEventListener("change", this.onChange);
        this.addEventListener("click", this.onClick);
        this.addEventListener("input", this.onInput);
        this.addEventListener("keydown", this.onKeyDown);
        this.addEventListener("submit", this.onSubmit, true);
        this.observer = new MutationObserver((records) => {
            if (records.some((record) => !presentationMutation(record))) {
                this.queueSync();
            }
        });
        this.observer.observe(this, { childList: true, subtree: true });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onChange);
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("input", this.onInput);
        this.removeEventListener("keydown", this.onKeyDown);
        this.removeEventListener("submit", this.onSubmit, true);
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    onChange = (event) => {
        const control = event.target instanceof HTMLElement ? event.target.closest("[data-sales-variant]") : null;
        if (!control || !this.contains(control)) {
            const feature = event.target instanceof HTMLElement ? event.target.closest("[data-sales-feature]") : null;
            if (feature && this.contains(feature)) {
                syncCatalogRowStates(this);
            }
            return;
        }
        const moduleId = control.getAttribute("data-module-id") || "";
        const variantId = control.getAttribute("data-catalog-id") || "";
        if (!moduleId || !variantId) {
            return;
        }
        if (checked(control)) {
            for (const candidate of this.querySelectorAll("[data-sales-variant]")) {
                if (candidate !== control && candidate.getAttribute("data-module-id") === moduleId) {
                    setChecked(candidate, false);
                }
            }
        }
        for (const feature of this.querySelectorAll("[data-sales-feature]")) {
            if (
                feature.getAttribute("data-module-id") === moduleId &&
                (!checked(control) || feature.getAttribute("data-variant-id") !== variantId)
            ) {
                setChecked(feature, false);
            }
        }
        this.syncFeatureAvailability();
        this.syncCatalogVisibility();
    };

    onClick = (event) => {
        const toggle = event.target instanceof Element ? event.target.closest("[data-sales-module-toggle]") : null;
        if (!toggle || !this.contains(toggle)) {
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
        this.syncCatalogVisibility();
    };

    onInput = (event) => {
        const search = event.target instanceof Element ? event.target.closest("[data-sales-catalog-search]") : null;
        if (!search || !this.contains(search)) {
            return;
        }
        this.catalogQuery = controlValue(search);
        this.syncCatalogVisibility();
    };

    onKeyDown = (event) => {
        const search = event.target instanceof Element ? event.target.closest("[data-sales-catalog-search]") : null;
        if (!search || !this.contains(search) || event.key !== "Escape" || !controlValue(search)) {
            return;
        }
        event.preventDefault();
        setControlValue(search, "");
        this.catalogQuery = "";
        this.syncCatalogVisibility();
    };

    onSubmit = (event) => {
        const form = event.target instanceof Element ? event.target.closest("[data-sales-draft-form]") : null;
        if (form && this.contains(form)) {
            prepareDraftPayload(form);
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
                this.sync();
            }
        });
    }

    sync() {
        const base = sourceBase(this);
        const proposalParam = parameterName(this.getAttribute("proposal-param"), "proposalId");
        setAttributeIfChanged(this, "cms-source", `${base}/getMyProposal?id=#{${proposalParam}} as proposalData`);
        setAttributeIfChanged(this, "cms-reload-on", REFRESH_EVENT);
        configureSource(this.querySelector("[data-sales-catalog-source]"), `${base}/getPartnerCatalog as catalogData`);
        configureForm(this.querySelector("[data-sales-draft-form]"), `${base}/saveMyProposalDraft as saveResult`);
        configureForm(this.querySelector("[data-sales-publish-form]"), `${base}/publishMyProposal as publishResult`);
        configureForm(
            this.querySelector("[data-sales-share-form]"),
            `${base}/createMyProposalShare as shareResult`,
            false,
        );
        for (const form of this.querySelectorAll("[data-sales-revoke-form]")) {
            configureForm(form, `${base}/revokeMyProposalShare as revokeResult`);
        }
        this.syncSelections();
        this.syncCatalogVisibility();
        this.syncTerminalState();
        this.syncShareLinks();
        formatMoney(this, this.getAttribute("locale") || this.ownerDocument.documentElement.lang || "en");
    }

    syncSelections() {
        const markers = Array.from(this.querySelectorAll("[data-sales-selected-id]"));
        const hasDraft = markers.some(
            (marker) =>
                marker.getAttribute("data-sales-version-state") === "draft" &&
                validBindingValue(marker.getAttribute("data-sales-selected-id")),
        );
        const selected = new Set(
            markers
                .filter((marker) => !hasDraft || marker.getAttribute("data-sales-version-state") === "draft")
                .map((marker) => marker.getAttribute("data-sales-selected-id")?.trim())
                .filter((value) => validBindingValue(value)),
        );
        const selectedVariants = new Set();
        for (const control of this.querySelectorAll("[data-sales-variant]")) {
            const id = control.getAttribute("data-catalog-id") || "";
            const value = selected.has(id);
            setChecked(control, value);
            if (value) {
                selectedVariants.add(id);
            }
        }
        for (const control of this.querySelectorAll("[data-sales-feature]")) {
            const id = control.getAttribute("data-catalog-id") || "";
            const variantId = control.getAttribute("data-variant-id") || "";
            setChecked(control, selected.has(id) && selectedVariants.has(variantId));
        }
        this.syncFeatureAvailability(selectedVariants);
    }

    syncFeatureAvailability(selectedVariants = null) {
        const activeVariants =
            selectedVariants ??
            new Set(
                Array.from(this.querySelectorAll("[data-sales-variant]"))
                    .filter((control) => checked(control))
                    .map((control) => control.getAttribute("data-catalog-id"))
                    .filter(Boolean),
            );
        for (const feature of this.querySelectorAll("[data-sales-feature]")) {
            const enabled = activeVariants.has(feature.getAttribute("data-variant-id"));
            if (!enabled) {
                setChecked(feature, false);
            }
            setDisabled(feature, !enabled);
        }
        syncCatalogRowStates(this);
    }

    syncCatalogVisibility() {
        const rows = Array.from(this.querySelectorAll("[data-sales-catalog-row]"));
        const catalog = indexCatalogRows(rows);
        const modules = Array.from(catalog.values()).filter((entry) => entry.moduleRow);
        if (modules.length === 0) {
            return;
        }
        const selectedModuleIds = new Set(
            Array.from(this.querySelectorAll("[data-sales-variant]"))
                .filter((variant) => checked(variant))
                .map((variant) => variant.getAttribute("data-module-id"))
                .filter(Boolean),
        );
        const query = normalizeSearch(this.catalogQuery);
        let visibleModules = 0;

        syncModuleCounts(catalog);
        syncCatalogRowStates(this, rows);

        for (const entry of modules) {
            const row = entry.moduleRow;
            const moduleId = row.getAttribute("data-sales-module-id") || "";
            const selected = selectedModuleIds.has(moduleId);
            const queryRows = rowsMatchingCatalogQuery(entry, query);
            const visible = !query || queryRows.size > 0 || selected;
            const manuallyExpanded = this.expandedModuleIds.has(moduleId);
            const expanded = query ? queryRows.size > 0 : manuallyExpanded;
            row.hidden = !visible;
            row.toggleAttribute("data-sales-selected", selected);
            if (visible) {
                visibleModules += 1;
            }
            syncModuleToggle(row, expanded, Boolean(query));
            const selectedLabel = row.querySelector("[data-sales-module-selected-label]");
            if (selectedLabel) {
                selectedLabel.hidden = !selected;
            }
            for (const childRow of entry.rows) {
                if (childRow === row) {
                    continue;
                }
                const relevant = !query || queryRows.has(childRow);
                childRow.hidden = !(visible && expanded && relevant);
            }
        }

        const noMatch = this.querySelector("[data-sales-catalog-no-match]");
        if (noMatch) {
            noMatch.hidden = visibleModules > 0;
        }
    }

    syncTerminalState() {
        const marker = this.querySelector("[data-sales-proposal-status]");
        const status = marker?.getAttribute("data-sales-proposal-status")?.trim() ?? "";
        if (!status || status.includes("{{")) {
            return;
        }
        const terminal = ["accepted", "rejected", "expired", "archived"].includes(status);
        for (const element of this.querySelectorAll("[data-sales-editable]")) {
            element.hidden = terminal;
        }
        for (const element of this.querySelectorAll("[data-sales-terminal]")) {
            element.hidden = !terminal;
        }
    }

    syncShareLinks() {
        const sharePath = safePath(this.getAttribute("share-path"), "/proposal");
        const tokenParam = parameterName(this.getAttribute("share-token-param"), "proposalToken");
        for (const link of this.querySelectorAll("[data-sales-share-link]")) {
            const token = link.getAttribute("data-sales-share-token")?.trim() ?? "";
            if (!validBindingValue(token)) {
                continue;
            }
            const separator = sharePath.includes("?") ? "&" : "?";
            setAttributeIfChanged(
                link,
                "href",
                `${sharePath}${separator}${encodeURIComponent(tokenParam)}=${encodeURIComponent(token)}`,
            );
        }
    }
}

function configureSource(element, source) {
    if (element) {
        setAttributeIfChanged(element, "cms-source", source);
    }
}

function configureForm(element, source, publish = true) {
    if (!element) {
        return;
    }
    setAttributeIfChanged(element, "cms-source", source);
    setAttributeIfChanged(element, "cms-source-trigger", "submit");
    setAttributeIfChanged(element, "cms-source-method", "POST");
    setAttributeIfChanged(element, "cms-source-success-reset", "false");
    if (publish) {
        setAttributeIfChanged(element, "cms-source-publish", REFRESH_EVENT);
    } else {
        element.removeAttribute("cms-source-publish");
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

function safePath(value, fallback) {
    const candidate = value?.trim() || "";
    return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : fallback;
}

function validBindingValue(value) {
    return Boolean(value && !value.includes("{{"));
}

function checked(control) {
    return Boolean(control.checked);
}

function controlValue(control) {
    return typeof control.value === "string" ? control.value : control.getAttribute("value") || "";
}

function setControlValue(control, value) {
    control.value = value;
    setAttributeIfChanged(control, "value", value);
}

function normalizeSearch(value) {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .trim();
}

function setChecked(control, value) {
    if (control.checked !== value) {
        control.checked = value;
    }
}

function setDisabled(control, value) {
    if (control.disabled !== value) {
        control.disabled = value;
    }
    if (value) {
        control.setAttribute("disabled", "");
    } else {
        control.removeAttribute("disabled");
    }
}

function indexCatalogRows(rows) {
    const modules = new Map();
    for (const row of rows) {
        const moduleId = row.getAttribute("data-sales-module-id") || "";
        const variantId = row.getAttribute("data-sales-variant-id") || "";
        const kind = row.getAttribute("data-sales-row-kind") || "";
        const entry = modules.get(moduleId) || {
            rows: [],
            moduleRow: null,
            variantRows: new Map(),
            featureRowsByVariant: new Map(),
            variants: 0,
            features: 0,
        };
        entry.rows.push(row);
        if (kind === "module") {
            entry.moduleRow = row;
        } else if (kind === "variant") {
            entry.variantRows.set(variantId, row);
            entry.variants += 1;
        } else if (kind === "feature") {
            const featureRows = entry.featureRowsByVariant.get(variantId) || [];
            featureRows.push(row);
            entry.featureRowsByVariant.set(variantId, featureRows);
            entry.features += 1;
        }
        modules.set(moduleId, entry);
    }
    return modules;
}

function rowsMatchingCatalogQuery(entry, query) {
    if (!query) {
        return new Set(entry.rows);
    }
    if (
        entry.moduleRow &&
        normalizeSearch(entry.moduleRow.getAttribute("data-sales-search-text") || "").includes(query)
    ) {
        return new Set(entry.rows);
    }
    const usefulRows = new Set();
    const directVariantIds = new Set();
    const contextualVariantIds = new Set();
    for (const row of entry.rows) {
        const kind = row.getAttribute("data-sales-row-kind") || "";
        if (kind === "module" || !normalizeSearch(row.getAttribute("data-sales-search-text") || "").includes(query)) {
            continue;
        }
        usefulRows.add(row);
        const variantId = row.getAttribute("data-sales-variant-id") || "";
        if (kind === "variant") {
            directVariantIds.add(variantId);
            contextualVariantIds.add(variantId);
        } else if (kind === "feature") {
            contextualVariantIds.add(variantId);
        }
    }
    for (const variantId of contextualVariantIds) {
        const variantRow = entry.variantRows.get(variantId);
        if (variantRow) {
            usefulRows.add(variantRow);
        }
    }
    for (const variantId of directVariantIds) {
        for (const featureRow of entry.featureRowsByVariant.get(variantId) || []) {
            usefulRows.add(featureRow);
        }
    }
    return usefulRows;
}

function syncCatalogRowStates(root, providedRows = null) {
    const rows = providedRows ?? Array.from(root.querySelectorAll("[data-sales-catalog-row]"));
    const selectedVariants = new Set(
        Array.from(root.querySelectorAll("[data-sales-variant]"))
            .filter((control) => checked(control))
            .map((control) => control.getAttribute("data-catalog-id"))
            .filter(Boolean),
    );
    const selectedModuleIds = new Set(
        Array.from(root.querySelectorAll("[data-sales-variant]"))
            .filter((control) => checked(control))
            .map((control) => control.getAttribute("data-module-id"))
            .filter(Boolean),
    );

    for (const row of rows) {
        const kind = row.getAttribute("data-sales-row-kind") || "";
        const moduleId = row.getAttribute("data-sales-module-id") || "";
        const variantId = row.getAttribute("data-sales-variant-id") || "";
        const control = row.querySelector(kind === "variant" ? "[data-sales-variant]" : "[data-sales-feature]");
        const enabled = kind !== "feature" || selectedVariants.has(variantId);
        const selected =
            (kind === "module" && selectedModuleIds.has(moduleId)) ||
            (kind === "variant" && Boolean(control && checked(control))) ||
            (kind === "feature" &&
                enabled &&
                (row.getAttribute("data-sales-availability") === "included" || Boolean(control && checked(control))));
        row.toggleAttribute("data-sales-selected", selected);
    }
}

function syncModuleCounts(catalog) {
    for (const { moduleRow, variants, features } of catalog.values()) {
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
    const label = toggle.getAttribute(attribute) || (expanded ? "Collapse" : "Configure");
    const output = toggle.querySelector("[data-sales-module-toggle-label]");
    if (output && output.textContent !== label) {
        output.textContent = label;
    }
}

function presentationMutation(record) {
    return (
        record.target instanceof Element &&
        Boolean(
            record.target.closest("[data-sales-money], [data-sales-module-counts], [data-sales-module-toggle-label]"),
        )
    );
}

function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SalesProposalBuilder);

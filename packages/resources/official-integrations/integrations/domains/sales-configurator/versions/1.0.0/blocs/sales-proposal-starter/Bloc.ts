import { prepareDraftPayload } from "./formPayload";
import { formatMoney } from "./presentation";

const REFRESH_EVENT = "sales-proposals:changed";

export class SalesProposalStarter extends HTMLElement {
    static observedAttributes = ["client-limit", "edit-path", "locale", "proposal-param", "source-id", "source-prefix"];

    observer = null;
    syncQueued = false;
    catalogQuery = "";
    dialogOpeners = new WeakMap();
    expandedModuleIds = new Set();

    connectedCallback() {
        this.addEventListener("change", this.onChange);
        this.addEventListener("click", this.onClick);
        this.addEventListener("input", this.onInput);
        this.addEventListener("keydown", this.onKeyDown);
        this.addEventListener("cancel", this.onCancel, true);
        this.addEventListener("cms-source:success", this.onSourceSuccess);
        this.addEventListener("submit", this.onSubmit, true);
        this.observer = new MutationObserver(() => this.queueSync());
        this.observer.observe(this, { childList: true, subtree: true });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onChange);
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("input", this.onInput);
        this.removeEventListener("keydown", this.onKeyDown);
        this.removeEventListener("cancel", this.onCancel, true);
        this.removeEventListener("cms-source:success", this.onSourceSuccess);
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
        const variant = closestWithin(this, event.target, "[data-sales-variant]");
        if (!variant) {
            return;
        }
        const moduleId = variant.getAttribute("data-module-id") || "";
        const variantId = variant.getAttribute("data-catalog-id") || "";
        if (checked(variant)) {
            for (const candidate of this.querySelectorAll("[data-sales-variant]")) {
                if (candidate !== variant && candidate.getAttribute("data-module-id") === moduleId) {
                    setChecked(candidate, false);
                }
            }
        }
        for (const feature of this.querySelectorAll("[data-sales-feature]")) {
            if (
                feature.getAttribute("data-module-id") === moduleId &&
                feature.getAttribute("data-variant-id") !== variantId
            ) {
                setChecked(feature, false);
            }
        }
        this.syncFeatureAvailability();
        this.syncCatalogVisibility();
    };

    onInput = (event) => {
        const search = closestWithin(this, event.target, "[data-sales-catalog-search]");
        if (!search) {
            return;
        }
        this.catalogQuery = controlValue(search);
        this.syncCatalogVisibility();
    };

    onKeyDown = (event) => {
        const search = closestWithin(this, event.target, "[data-sales-catalog-search]");
        if (!search || event.key !== "Escape" || !controlValue(search)) {
            return;
        }
        event.preventDefault();
        setControlValue(search, "");
        this.catalogQuery = "";
        this.syncCatalogVisibility();
    };

    onClick = (event) => {
        const close = closestWithin(this, event.target, "[data-sales-client-dialog-close]");
        if (close) {
            event.preventDefault();
            const dialog = close.closest("dialog");
            if (dialog) {
                this.dismissDialog(dialog);
            }
            return;
        }
        const createClient = closestWithin(this, event.target, "[data-sales-client-create-open]");
        if (createClient) {
            event.preventDefault();
            const dialog = this.querySelector("[data-sales-client-create-dialog]");
            if (dialog) {
                this.showDialog(dialog, createClient, '[name="companyName"]');
            }
            return;
        }
        const toggle = closestWithin(this, event.target, "[data-sales-module-toggle]");
        if (toggle) {
            event.preventDefault();
            const moduleId = toggle.getAttribute("data-module-id") || "";
            if (moduleId) {
                if (this.expandedModuleIds.has(moduleId)) {
                    this.expandedModuleIds.delete(moduleId);
                } else {
                    this.expandedModuleIds.add(moduleId);
                }
                this.syncCatalogVisibility();
            }
            return;
        }
        const add = closestWithin(this, event.target, "[data-sales-add-request]");
        if (add) {
            event.preventDefault();
            const template = this.querySelector("[data-sales-request-template]");
            const target = this.querySelector("[data-sales-custom-requests]");
            if (template?.content && target) {
                target.append(template.content.cloneNode(true));
            }
            return;
        }
        const remove = closestWithin(this, event.target, "[data-sales-remove-request]");
        if (remove) {
            event.preventDefault();
            remove.closest("[data-sales-custom-request-row]")?.remove();
        }
    };

    onCancel = (event) => {
        const dialog = event.target instanceof Element ? event.target.closest("dialog") : null;
        if (!dialog || !this.contains(dialog)) {
            return;
        }
        queueMicrotask(() => this.restoreDialogFocus(dialog));
    };

    onSourceSuccess = (event) => {
        const form = closestWithin(this, event.target, "[data-sales-client-form]");
        const dialog = form?.closest("[data-sales-client-create-dialog]");
        if (dialog) {
            this.dismissDialog(dialog);
        }
    };

    onSubmit = (event) => {
        const form = closestWithin(this, event.target, "[data-sales-create-form]");
        if (form) {
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
        const limit = positiveInteger(this.getAttribute("client-limit"), 100, 100);
        setAttributeIfChanged(this, "cms-source", `${base}/listMyClients?limit=${limit} as clientsData`);
        setAttributeIfChanged(this, "cms-reload-on", "sales-clients:changed");
        configureSource(this.querySelector("[data-sales-catalog-source]"), `${base}/getPartnerCatalog as catalogData`);
        configureForm(
            this.querySelector("[data-sales-client-form]"),
            `${base}/saveMyClient as clientResult`,
            "sales-clients:changed",
            true,
        );
        configureForm(
            this.querySelector("[data-sales-create-form]"),
            `${base}/saveMyProposalDraft as saveResult`,
            REFRESH_EVENT,
        );
        this.syncFeatureAvailability();
        this.syncCatalogVisibility();
        this.syncCreatedLinks();
        formatMoney(this, this.getAttribute("locale") || this.ownerDocument.documentElement.lang || "en");
    }

    syncFeatureAvailability() {
        const selectedVariants = new Set(
            Array.from(this.querySelectorAll("[data-sales-variant]"))
                .filter((variant) => checked(variant))
                .map((variant) => variant.getAttribute("data-catalog-id")),
        );
        for (const feature of this.querySelectorAll("[data-sales-feature]")) {
            const available = selectedVariants.has(feature.getAttribute("data-variant-id"));
            feature.disabled = !available;
            if (!available) {
                setChecked(feature, false);
            }
        }
    }

    syncCatalogVisibility() {
        const rows = Array.from(this.querySelectorAll("[data-sales-catalog-row]"));
        const moduleRows = rows.filter((row) => row.getAttribute("data-sales-row-kind") === "module");
        if (moduleRows.length === 0) {
            return;
        }
        const selectedModuleIds = new Set(
            Array.from(this.querySelectorAll("[data-sales-variant]"))
                .filter((variant) => checked(variant))
                .map((variant) => variant.getAttribute("data-module-id"))
                .filter(Boolean),
        );
        const query = normalizeSearch(this.catalogQuery);
        const visibleModuleIds = new Set();

        for (const row of moduleRows) {
            const moduleId = row.getAttribute("data-sales-module-id") || "";
            const selected = selectedModuleIds.has(moduleId);
            const matches = !query || normalizeSearch(row.getAttribute("data-sales-search-text") || "").includes(query);
            const visible = matches || selected;
            row.hidden = !visible;
            row.toggleAttribute("data-sales-module-selected", selected);
            if (visible) {
                visibleModuleIds.add(moduleId);
            }
            const toggle = row.querySelector("[data-sales-module-toggle]");
            toggle?.setAttribute("aria-expanded", String(this.expandedModuleIds.has(moduleId)));
            const selectedLabel = row.querySelector("[data-sales-module-selected-label]");
            if (selectedLabel) {
                selectedLabel.hidden = !selected;
            }
        }

        for (const row of rows) {
            if (row.getAttribute("data-sales-row-kind") === "module") {
                continue;
            }
            const moduleId = row.getAttribute("data-sales-module-id") || "";
            row.hidden = !(visibleModuleIds.has(moduleId) && this.expandedModuleIds.has(moduleId));
        }

        const noMatch = this.querySelector("[data-sales-catalog-no-match]");
        if (noMatch) {
            noMatch.hidden = visibleModuleIds.size > 0;
        }
    }

    showDialog(dialog, opener, focusSelector) {
        this.dialogOpeners.set(dialog, opener);
        if (!(dialog.open || dialog.hasAttribute("open"))) {
            dialog.removeAttribute("data-sales-client-dialog-focused");
            try {
                if (typeof dialog.showModal === "function") {
                    dialog.showModal();
                } else {
                    dialog.setAttribute("open", "");
                }
            } catch {
                dialog.setAttribute("open", "");
            }
        }
        if (dialog.hasAttribute("data-sales-client-dialog-focused")) {
            return;
        }
        queueMicrotask(() => {
            const target = dialog.querySelector(focusSelector);
            if ((dialog.open || dialog.hasAttribute("open")) && target) {
                target.focus();
                dialog.setAttribute("data-sales-client-dialog-focused", "");
            }
        });
    }

    dismissDialog(dialog) {
        try {
            if (typeof dialog.close === "function" && (dialog.open || dialog.hasAttribute("open"))) {
                dialog.close();
            } else {
                dialog.removeAttribute("open");
            }
        } catch {
            dialog.removeAttribute("open");
        }
        this.restoreDialogFocus(dialog);
    }

    restoreDialogFocus(dialog) {
        const opener = this.dialogOpeners.get(dialog);
        if (opener?.isConnected) {
            opener.focus();
        }
    }

    syncCreatedLinks() {
        const path = safePath(this.getAttribute("edit-path"), "/proposals/edit");
        const parameter = parameterName(this.getAttribute("proposal-param"), "proposalId");
        for (const link of this.querySelectorAll("[data-sales-created-link]")) {
            const proposalId = link.getAttribute("data-proposal-id")?.trim() ?? "";
            if (!proposalId || proposalId.includes("{{")) {
                link.removeAttribute("href");
                continue;
            }
            setAttributeIfChanged(link, "href", hrefWithParameter(path, parameter, proposalId));
        }
    }
}

function configureSource(element, source) {
    if (element) {
        setAttributeIfChanged(element, "cms-source", source);
    }
}

function configureForm(element, source, publishEvent, resetAfterSuccess = false) {
    if (!element) {
        return;
    }
    setAttributeIfChanged(element, "cms-source", source);
    setAttributeIfChanged(element, "cms-source-trigger", "submit");
    setAttributeIfChanged(element, "cms-source-method", "POST");
    setAttributeIfChanged(element, "cms-source-success-reset", String(resetAfterSuccess));
    setAttributeIfChanged(element, "cms-source-publish", publishEvent);
}

function sourceBase(host) {
    const prefix = (host.getAttribute("source-prefix") || "/.cms/sources").replace(/\/+$/, "");
    const id = encodeURIComponent(host.getAttribute("source-id")?.trim() || "sales-configurator");
    return `${prefix}/${id}`;
}

function positiveInteger(value, fallback, maximum) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function parameterName(value, fallback) {
    const candidate = value?.trim() || "";
    return /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/.test(candidate) ? candidate : fallback;
}

function safePath(value, fallback) {
    const candidate = value?.trim() || "";
    return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : fallback;
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

function closestWithin(host, target, selector) {
    const match = target instanceof Element ? target.closest(selector) : null;
    return match && host.contains(match) ? match : null;
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

function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SalesProposalStarter);

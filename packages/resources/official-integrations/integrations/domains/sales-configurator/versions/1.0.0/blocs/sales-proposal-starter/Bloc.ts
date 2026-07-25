import { prepareDraftPayload } from "./formPayload";
import { formatMoney } from "./presentation";

const REFRESH_EVENT = "sales-proposals:changed";

export class SalesProposalStarter extends HTMLElement {
    static observedAttributes = ["client-limit", "edit-path", "locale", "proposal-param", "source-id", "source-prefix"];

    observer = null;
    syncQueued = false;

    connectedCallback() {
        this.addEventListener("change", this.onChange);
        this.addEventListener("click", this.onClick);
        this.addEventListener("submit", this.onSubmit, true);
        this.observer = new MutationObserver(() => this.queueSync());
        this.observer.observe(this, { childList: true, subtree: true });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onChange);
        this.removeEventListener("click", this.onClick);
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
    };

    onClick = (event) => {
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
        );
        configureForm(
            this.querySelector("[data-sales-create-form]"),
            `${base}/saveMyProposalDraft as saveResult`,
            REFRESH_EVENT,
        );
        this.syncFeatureAvailability();
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

function configureForm(element, source, publishEvent) {
    if (!element) {
        return;
    }
    setAttributeIfChanged(element, "cms-source", source);
    setAttributeIfChanged(element, "cms-source-trigger", "submit");
    setAttributeIfChanged(element, "cms-source-method", "POST");
    setAttributeIfChanged(element, "cms-source-success-reset", "false");
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

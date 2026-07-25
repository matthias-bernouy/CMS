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

    connectedCallback() {
        this.addEventListener("change", this.onChange);
        this.addEventListener("submit", this.onSubmit, true);
        this.observer = new MutationObserver(() => this.queueSync());
        this.observer.observe(this, { childList: true, subtree: true });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onChange);
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
        control.setAttribute("aria-disabled", "true");
    } else {
        control.removeAttribute("disabled");
        control.removeAttribute("aria-disabled");
    }
}

function setAttributeIfChanged(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SalesProposalBuilder);

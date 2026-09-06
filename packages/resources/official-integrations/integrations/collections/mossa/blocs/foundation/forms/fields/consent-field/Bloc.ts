import css from "./style.css" with { type: "text" };

export class ConsentField extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
        "context-key",
        "appearance",
        "heading",
        "loading-label",
        "load-error-label",
        "retry-label",
        "required-message",
        "changed-label",
        "new-tab-label",
    ];

    internals;
    observer = null;
    failureTarget = null;
    attemptId = crypto.randomUUID();
    syncQueued = false;
    validationVisible = false;

    constructor() {
        super();
        this.internals = this.attachInternals();
    }

    connectedCallback() {
        this.ensureStyle();
        this.addEventListener("change", this.onChange);
        this.addEventListener("click", this.onClick);
        this.addEventListener("invalid", this.onInvalid);
        this.failureTarget = this.closest("form") ?? this.internals.form;
        this.failureTarget?.addEventListener("cms-source:failed", this.onSourceFailed);
        const Observer = this.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.observer = new Observer(() => {
            this.queueSync();
        });
        this.observer.observe(this, {
            attributes: true,
            attributeFilter: ["hidden", "value", "cms-ready"],
            childList: true,
            subtree: true,
        });
        this.sync();
    }

    disconnectedCallback() {
        this.removeEventListener("change", this.onChange);
        this.removeEventListener("click", this.onClick);
        this.removeEventListener("invalid", this.onInvalid);
        this.failureTarget?.removeEventListener("cms-source:failed", this.onSourceFailed);
        this.failureTarget = null;
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    formResetCallback() {
        this.attemptId = crypto.randomUUID();
        this.validationVisible = false;
        for (const checkbox of this.checkboxes()) {
            checkbox.checked = false;
        }
        setHidden(this.querySelector("[data-consent-changed]"), true);
        this.syncFormValue();
    }

    formDisabledCallback(disabled) {
        for (const checkbox of this.checkboxes()) {
            checkbox.disabled = disabled;
        }
        this.syncFormValue();
    }

    formStateRestoreCallback(state) {
        if (typeof state !== "string") {
            return;
        }
        try {
            const restored = JSON.parse(state);
            if (!restored || typeof restored !== "object") {
                return;
            }
            if (typeof restored.attemptId === "string") {
                this.attemptId = restored.attemptId;
            }
            const selected = new Set(Array.isArray(restored.versionIds) ? restored.versionIds : []);
            for (const checkbox of this.checkboxes()) {
                checkbox.checked = selected.has(checkbox.value);
            }
            this.syncFormValue();
        } catch {
            // Invalid browser-restored state is ignored and replaced by current requirements.
        }
    }

    focus(options) {
        (this.checkboxes().find((checkbox) => !checkbox.checked) ?? this.checkboxes()[0])?.focus(options);
    }

    onChange = (event) => {
        if (event.target instanceof HTMLInputElement && event.target.hasAttribute("data-consent-version")) {
            this.syncFormValue();
        }
    };

    onInvalid = () => {
        this.validationVisible = true;
        this.syncFormValue();
    };

    onClick = (event) => {
        const retry = event.target instanceof Element ? event.target.closest("[data-consent-retry]") : null;
        if (!retry || !this.contains(retry)) {
            return;
        }
        event.preventDefault();
        this.ownerDocument.dispatchEvent(new Event("consent:reload"));
    };

    onSourceFailed = (event) => {
        const detail = event && typeof event === "object" && "detail" in event ? event.detail : null;
        const body = detail && typeof detail === "object" ? detail.body : null;
        const trigger = body && typeof body === "object" ? body.trigger : null;
        if (trigger !== "consent-stage-target") {
            return;
        }
        this.attemptId = crypto.randomUUID();
        this.validationVisible = false;
        for (const checkbox of this.checkboxes()) {
            checkbox.checked = false;
        }
        setHidden(this.querySelector("[data-consent-changed]"), false);
        this.syncFormValue();
        this.ownerDocument.dispatchEvent(new Event("consent:reload"));
    };

    queueSync() {
        if (this.syncQueued) {
            return;
        }
        this.syncQueued = true;
        queueMicrotask(() => {
            this.syncQueued = false;
            if (this.isConnected) {
                this.syncFormValue();
            }
        });
    }

    sync() {
        const context = encodeURIComponent(this.getAttribute("context-key")?.trim() || "signup");
        setAttribute(
            this,
            "cms-source",
            `/.cms/sources/consent/getRequirements?context=${context} as consentRequirements`,
        );
        setCopy(this, "[data-consent-heading]", "heading", "Required terms");
        setCopy(this, "[data-consent-preview-heading]", "heading", "Required terms");
        setCopy(this, "[data-consent-loading]", "loading-label", "Loading terms…");
        setCopy(this, "[data-consent-error-copy]", "load-error-label", "Terms could not be loaded.");
        setCopy(this, "[data-consent-retry]", "retry-label", "Try again");
        setCopy(this, "[data-consent-required-copy]", "required-message", "Accept all terms to continue.");
        setCopy(
            this,
            "[data-consent-changed]",
            "changed-label",
            "The terms could not be validated. Review them before trying again.",
        );
        setCopies(this, "[data-consent-new-tab-label]", "new-tab-label", "(opens in a new tab)");
        setCopy(this, "[data-consent-preview-new-tab-label]", "new-tab-label", "(opens in a new tab)");
        this.syncFormValue();
    }

    syncFormValue() {
        if (this.isEditorInert()) {
            this.internals.setFormValue(null);
            this.internals.setValidity({});
            return;
        }
        const ready = visible(this.querySelector("[data-consent-ready]"));
        const error = visible(this.querySelector("[data-consent-error]"));
        const requiredCopy = this.querySelector("[data-consent-required-copy]");
        if (!ready || error) {
            setHidden(requiredCopy, true);
            this.internals.setFormValue(null);
            this.internals.setValidity(
                { customError: true },
                error ? "Consent requirements are unavailable." : "Consent requirements are loading.",
            );
            return;
        }
        const checkboxes = this.checkboxes().filter((checkbox) => !checkbox.disabled);
        const selected = checkboxes.filter((checkbox) => checkbox.checked);
        if (selected.length !== checkboxes.length) {
            setHidden(requiredCopy, !this.validationVisible);
            this.internals.setFormValue(null);
            this.internals.setValidity(
                { valueMissing: true },
                this.getAttribute("required-message") || "Accept all terms to continue.",
                checkboxes.find((checkbox) => !checkbox.checked),
            );
            return;
        }
        setHidden(requiredCopy, true);
        this.validationVisible = false;
        if (!checkboxes.length) {
            setHidden(this.querySelector("[data-consent-changed]"), true);
            this.internals.setFormValue(null);
            this.internals.setValidity({});
            return;
        }
        const data = new FormData();
        data.append("consentAttemptId", this.attemptId);
        for (const checkbox of selected) {
            data.append("acceptedConsentVersionIds[]", checkbox.value);
        }
        setHidden(this.querySelector("[data-consent-changed]"), true);
        this.internals.setFormValue(
            data,
            JSON.stringify({
                attemptId: this.attemptId,
                versionIds: selected.map((checkbox) => checkbox.value),
            }),
        );
        this.internals.setValidity({});
    }

    checkboxes() {
        return [...this.querySelectorAll("input[data-consent-version]")];
    }

    isEditorInert() {
        return Boolean(
            this.closest("[cms-bind-stop], cms-binding-core[cms-binding-disabled]") ||
                this.hasAttribute("cms-binding-disabled"),
        );
    }

    ensureStyle() {
        if (this.querySelector(":scope > style[data-mossa-consent-field-style]")) {
            return;
        }
        const style = document.createElement("style");
        style.dataset.consentFieldStyle = "";
        style.textContent = css;
        this.prepend(style);
    }
}

function visible(element) {
    return element instanceof HTMLElement && !element.hidden && getComputedStyle(element).display !== "none";
}

function setAttribute(element, name, value) {
    if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value);
    }
}

function setCopy(root, selector, attribute, fallback) {
    const element = root.querySelector(selector);
    const value = root.getAttribute(attribute) || fallback;
    if (element && element.textContent !== value) {
        element.textContent = value;
    }
}

function setCopies(root, selector, attribute, fallback) {
    const value = root.getAttribute(attribute) || fallback;
    for (const element of root.querySelectorAll(selector)) {
        setText(element, value);
    }
}

function setText(element, value) {
    if (element && element.textContent !== value) {
        element.textContent = value;
    }
}

function setHidden(element, hidden) {
    if (!element || element.hasAttribute("hidden") === hidden) {
        return;
    }
    element.toggleAttribute("hidden", hidden);
}

if (!customElements.get("BE5_TAG_TO_BE_REPLACED")) {
    customElements.define("BE5_TAG_TO_BE_REPLACED", ConsentField);
}

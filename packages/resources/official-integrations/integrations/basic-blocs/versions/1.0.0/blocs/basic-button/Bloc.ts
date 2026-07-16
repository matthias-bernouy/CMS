export class BasicButton extends HTMLElement {
    static formAssociated = true;

    static get observedAttributes() {
        return [
            "accent-color",
            "action",
            "align",
            "appearance",
            "background-color",
            "border-color",
            "disabled",
            "href",
            "name",
            "rel",
            "size",
            "target",
            "text-color",
            "type",
            "value",
            "width",
        ];
    }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internals = this.attachInternals();
        this.formDisabled = false;
    }

    connectedCallback() {
        this.render();
    }

    attributeChangedCallback(name, _oldValue, value) {
        if (name === "disabled" && ["false", "no", "0"].includes((value || "").trim().toLowerCase())) {
            this.removeAttribute("disabled");
            return;
        }
        if (this.isConnected) this.render();
    }

    formDisabledCallback(disabled) {
        this.formDisabled = disabled;
        if (this.isConnected) this.render();
    }

    get name() {
        return this.getAttribute("name") || "";
    }

    set name(value) {
        value ? this.setAttribute("name", value) : this.removeAttribute("name");
    }

    get value() {
        return this.getAttribute("value") || "";
    }

    set value(value) {
        this.setAttribute("value", String(value));
    }

    get disabled() {
        return this.formDisabled || this.hasAttribute("disabled");
    }

    set disabled(value) {
        this.toggleAttribute("disabled", Boolean(value));
    }

    focus(options) {
        this.control?.focus(options);
    }

    render() {
        const href = this.getAttribute("href");
        const action = this.getAttribute("action");
        const isLink = action === "link" || (action === null && href !== null);
        const tag = isLink ? "a" : "button";
        const attributes = isLink
            ? this.linkAttributes(href || "")
            : this.buttonAttributes();

        this.root.innerHTML = `
            <style>
                :host {
                    display: inline-block;
                    max-width: 100%;
                    font: inherit;
                    color: inherit;
                    vertical-align: middle;
                }

                [part="button"] {
                    box-sizing: border-box;
                    display: inline-flex;
                    align-items: center;
                    justify-content: var(--cms-button-alignment, center);
                    gap: var(--cms-button-gap, .5rem);
                    min-height: var(--cms-button-min-height, 2.5rem);
                    padding: var(--cms-button-padding, .625rem 1rem);
                    border: var(--cms-button-border, 1px solid var(--cms-button-border-color, var(--primary-base, CanvasText)));
                    border-radius: var(--cms-button-radius, .375rem);
                    background: var(--cms-button-background, var(--primary-base, CanvasText));
                    color: var(--cms-button-color, var(--primary-foreground, var(--primary-contrasted, Canvas)));
                    font: inherit;
                    font-weight: var(--cms-button-font-weight, 700);
                    line-height: 1.2;
                    text-decoration: none;
                    text-align: center;
                    cursor: pointer;
                    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease;
                }

                [part="button"]:hover:not([disabled]):not([aria-disabled="true"]) {
                    background: var(--cms-button-hover-background, color-mix(in srgb, var(--cms-button-background, currentColor) 88%, Canvas));
                }

                [part="button"]:active:not([disabled]):not([aria-disabled="true"]) { transform: translateY(1px); }

                [part="button"]:focus-visible {
                    outline: 2px solid var(--cms-focus-color, var(--primary-base, CanvasText));
                    outline-offset: 2px;
                }

                [part="button"][disabled],
                [part="button"][aria-disabled="true"] {
                    cursor: not-allowed;
                    opacity: .6;
                }

                :host([appearance="outlined"]) [part="button"] {
                    background: var(--cms-button-background, transparent);
                    color: var(--cms-button-color, currentColor);
                    border-color: var(--cms-button-border-color, currentColor);
                }

                :host([appearance="ghost"]) [part="button"] {
                    background: var(--cms-button-background, transparent);
                    color: var(--cms-button-color, currentColor);
                    border-color: var(--cms-button-border-color, transparent);
                }

                :host([appearance="outlined"]) [part="button"]:hover:not([disabled]):not([aria-disabled="true"]),
                :host([appearance="ghost"]) [part="button"]:hover:not([disabled]):not([aria-disabled="true"]) {
                    background: var(--cms-button-hover-background, color-mix(in srgb, currentColor 10%, transparent));
                }

                :host([size="xs"]) [part="button"] { min-height: 1.9rem; padding: .3rem .7rem; font-size: .78rem; }
                :host([size="sm"]) [part="button"] { min-height: 2.2rem; padding: .45rem .9rem; font-size: .85rem; }
                :host([size="lg"]) [part="button"] { min-height: 3rem; padding: .8rem 1.6rem; font-size: 1.05rem; }
                :host([size="xl"]) [part="button"] { min-height: 3.4rem; padding: 1rem 2rem; font-size: 1.15rem; }

                :host([width="full"]) { display: block; }
                :host([width="full"]) [part="button"] { display: flex; width: 100%; }
                :host([align="left"]) [part="button"] { --cms-button-alignment: flex-start; }
                :host([align="right"]) [part="button"] { --cms-button-alignment: flex-end; }

                [part^="icon-"] {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    flex: 0 0 auto;
                    line-height: 0;
                }

                [part^="icon-"][hidden] { display: none; }
                slot[name="icon-left"]::slotted(svg),
                slot[name="icon-right"]::slotted(svg) { width: 1em; height: 1em; }
            </style>
            <${tag} part="button"${attributes}>
                <span part="icon-left" hidden><slot name="icon-left"></slot></span>
                <span part="label"><slot>Button</slot></span>
                <span part="icon-right" hidden><slot name="icon-right"></slot></span>
            </${tag}>
        `;
        this.control = this.root.querySelector('[part="button"]');
        this.syncColors(this.control.style);
        this.control?.addEventListener("click", this.onClick);
        this.syncIcons();
        for (const slot of this.root.querySelectorAll('slot[name^="icon-"]')) {
            slot.addEventListener("slotchange", this.syncIcons);
        }
    }

    buttonAttributes() {
        const type = this.getAttribute("type") || "button";
        return ` type="${escapeAttribute(type)}"${this.disabled ? " disabled" : ""}`;
    }

    linkAttributes(href) {
        const target = this.getAttribute("target");
        const explicitRel = this.getAttribute("rel");
        const rel = explicitRel || (target === "_blank" ? "noopener noreferrer" : "");
        return [
            ` href="${escapeAttribute(href)}"`,
            target ? ` target="${escapeAttribute(target)}"` : "",
            rel ? ` rel="${escapeAttribute(rel)}"` : "",
            this.disabled ? ` aria-disabled="true" tabindex="-1"` : "",
        ].join("");
    }

    syncIcons = () => {
        for (const side of ["left", "right"]) {
            const slot = this.root.querySelector(`slot[name="icon-${side}"]`);
            const wrapper = this.root.querySelector(`[part="icon-${side}"]`);
            if (slot && wrapper) wrapper.hidden = slot.assignedNodes({ flatten: true }).length === 0;
        }
    };

    syncColors(rule) {
        for (const [attribute, property] of [
            ["accent-color", "--cms-focus-color"],
            ["background-color", "--cms-button-background"],
            ["border-color", "--cms-button-border-color"],
            ["text-color", "--cms-button-color"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) rule.setProperty(property, value);
            else rule.removeProperty(property);
        }
    }

    onClick = event => {
        if (this.disabled) {
            event.preventDefault();
            return;
        }
        if (this.getAttribute("action") === "link" || this.getAttribute("href")) return;
        const type = this.getAttribute("type") || "button";
        const form = this.internals.form || this.closest("form");
        if (type === "submit") {
            event.preventDefault();
            if (form) this.requestFormSubmit(form);
        } else if (type === "reset") {
            event.preventDefault();
            form?.reset();
        }
    };

    requestFormSubmit(form) {
        const submitter = form.ownerDocument.createElement("button");
        submitter.type = "submit";
        submitter.hidden = true;
        submitter.tabIndex = -1;
        submitter.setAttribute("aria-hidden", "true");

        const name = this.name.trim();
        this.internals.setFormValue(name ? this.value : null);

        form.append(submitter);
        try {
            form.requestSubmit(submitter);
        } finally {
            submitter.remove();
            this.internals.setFormValue(null);
        }
    }
}

function escapeAttribute(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("\"", "&quot;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicButton);

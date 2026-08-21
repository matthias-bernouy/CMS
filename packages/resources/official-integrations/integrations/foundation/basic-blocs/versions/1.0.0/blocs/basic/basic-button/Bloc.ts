import { basicColorSchemeCss } from "./colorSchemes";
import css from "./style.css" with { type: "text" };

export class BasicButton extends HTMLElement {
    static formAssociated = true;

    static get observedAttributes() {
        return [
            "action",
            "align",
            "appearance",
            "disabled",
            "href",
            "name",
            "rel",
            "size",
            "target",
            "tone",
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
        if (this.isConnected) {
            this.render();
        }
    }

    formDisabledCallback(disabled) {
        this.formDisabled = disabled;
        if (this.isConnected) {
            this.render();
        }
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
        const isLink = this.isLinkAction();
        const tag = isLink ? "a" : "button";
        const attributes = isLink ? this.linkAttributes(href || "") : this.buttonAttributes();

        this.root.innerHTML = `
            <style>
                ${basicColorSchemeCss()}
                ${css}
            </style>
            <${tag} part="button"${attributes}>
                <span part="icon-left" hidden><slot name="icon-left"></slot></span>
                <span part="label"><slot>Button</slot></span>
                <span part="icon-right" hidden><slot name="icon-right"></slot></span>
            </${tag}>
        `;
        this.control = this.root.querySelector('[part="button"]');
        this.control?.addEventListener("click", this.onClick);
        this.syncIcons();
        for (const slot of this.root.querySelectorAll('slot[name^="icon-"]')) {
            slot.addEventListener("slotchange", this.syncIcons);
        }
    }

    buttonAttributes() {
        const type = this.buttonType();
        return ` type="${escapeAttribute(type)}"${this.disabled ? " disabled" : ""}`;
    }

    buttonType() {
        const action = this.getAttribute("action");
        return ["button", "submit", "reset"].includes(action) ? action : this.getAttribute("type") || "button";
    }

    isLinkAction() {
        const action = this.getAttribute("action");
        return action === "link" || (action === null && this.hasAttribute("href"));
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
            if (slot && wrapper) {
                wrapper.hidden = slot.assignedNodes({ flatten: true }).length === 0;
            }
        }
    };

    onClick = (event) => {
        if (this.disabled) {
            event.preventDefault();
            return;
        }
        if (this.isLinkAction()) {
            return;
        }
        const type = this.buttonType();
        const form = this.internals.form || this.closest("form");
        if (type === "submit") {
            event.preventDefault();
            if (form) {
                this.requestFormSubmit(form);
            }
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
    return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicButton);

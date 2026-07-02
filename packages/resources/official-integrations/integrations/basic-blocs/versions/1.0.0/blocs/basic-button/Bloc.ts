export class BasicButton extends HTMLElement {
    static get observedAttributes() {
        return ["disabled", "href", "rel", "target", "type"];
    }

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.render();
    }

    attributeChangedCallback() {
        if (this.isConnected) this.render();
    }

    render() {
        const href = this.getAttribute("href");
        const tag = href ? "a" : "button";
        const attributes = href
            ? this.linkAttributes(href)
            : this.buttonAttributes();

        this.root.innerHTML = `
            <style>
                :host {
                    display: inline-block;
                    font: inherit;
                    color: inherit;
                }

                [part="button"] {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--cms-button-gap, .5rem);
                    min-height: var(--cms-button-min-height, 2.5rem);
                    padding: var(--cms-button-padding, .625rem 1rem);
                    border: var(--cms-button-border, 1px solid currentColor);
                    border-radius: var(--cms-button-radius, .375rem);
                    background: var(--cms-button-background, currentColor);
                    color: var(--cms-button-color, Canvas);
                    font: inherit;
                    font-weight: var(--cms-button-font-weight, 700);
                    line-height: 1.2;
                    text-decoration: none;
                    cursor: pointer;
                }

                [part="button"]:focus-visible {
                    outline: 2px solid var(--cms-focus-color, currentColor);
                    outline-offset: 2px;
                }

                [part="button"][disabled],
                [part="button"][aria-disabled="true"] {
                    cursor: not-allowed;
                    opacity: .6;
                }
            </style>
            <${tag} part="button"${attributes}><slot>Button</slot></${tag}>
        `;
    }

    buttonAttributes() {
        const type = this.getAttribute("type") || "button";
        return ` type="${escapeAttribute(type)}"${this.hasAttribute("disabled") ? " disabled" : ""}`;
    }

    linkAttributes(href) {
        const target = this.getAttribute("target");
        const explicitRel = this.getAttribute("rel");
        const rel = explicitRel || (target === "_blank" ? "noopener noreferrer" : "");
        return [
            ` href="${escapeAttribute(href)}"`,
            target ? ` target="${escapeAttribute(target)}"` : "",
            rel ? ` rel="${escapeAttribute(rel)}"` : "",
            this.hasAttribute("disabled") ? ` aria-disabled="true"` : "",
        ].join("");
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

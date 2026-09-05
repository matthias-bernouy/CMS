class MossaChip extends HTMLElement {
    static observedAttributes = ["disabled", "selected"];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.root.innerHTML = `
            <style>
                :host {
                    display: inline-block;
                    color: inherit;
                    font: inherit;
                }

                button {
                    min-height: 2.5rem;
                    padding: .5rem .8rem;
                    border: var(--_mossa-chip-border, 1px solid var(--_mossa-chip-border-color, var(--ulvia-surface-border)));
                    border-radius: var(--_mossa-chip-radius, 999px);
                    background: var(--_mossa-chip-background, var(--ulvia-surface-background));
                    color: var(--_mossa-chip-color, var(--ulvia-surface-text));
                    font: inherit;
                    cursor: pointer;
                }

                :host([selected]) button {
                    border-color: var(--_mossa-chip-selected-border, var(--ulvia-primary-base));
                    background: var(--_mossa-chip-selected-background, var(--ulvia-primary-base));
                    color: var(--_mossa-chip-selected-color, var(--_mossa-chip-color, var(--ulvia-primary-foreground)));
                }

                button:focus-visible {
                    outline: 2px solid var(--_mossa-focus-color, var(--ulvia-primary-base));
                    outline-offset: 2px;
                }

                button:disabled {
                    cursor: not-allowed;
                    opacity: .6;
                }
            </style>
            <button type="button" part="button"><slot></slot></button>
        `;
        this.button = this.root.querySelector("button");
    }

    connectedCallback() {
        this.button.addEventListener("click", this.onClick);
        this.sync();
    }

    disconnectedCallback() {
        this.button.removeEventListener("click", this.onClick);
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.sync();
        }
    }

    get value() {
        return this.getAttribute("value") || "";
    }

    get selected() {
        return this.hasAttribute("selected");
    }

    set selected(value) {
        this.toggleAttribute("selected", Boolean(value));
    }

    get disabled() {
        return this.hasAttribute("disabled");
    }

    set disabled(value) {
        this.toggleAttribute("disabled", Boolean(value));
    }

    focus(options) {
        this.button.focus(options);
    }

    sync() {
        this.button.disabled = this.disabled;
        this.button.setAttribute("aria-pressed", String(this.selected));
    }

    onClick = () => {
        if (this.disabled) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent("mossa-chip:toggle", {
                bubbles: true,
                composed: true,
                detail: { value: this.value },
            }),
        );
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaChip);

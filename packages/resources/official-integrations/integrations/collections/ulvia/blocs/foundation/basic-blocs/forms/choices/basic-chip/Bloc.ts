class BasicChip extends HTMLElement {
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
                    border: var(--cms-chip-border, 1px solid var(--cms-chip-border-color, var(--ulvia-field-border, color-mix(in srgb, currentColor 25%, transparent))));
                    border-radius: var(--cms-chip-radius, 999px);
                    background: var(--cms-chip-background, var(--ulvia-field-background, var(--bg-surface, Canvas)));
                    color: var(--cms-chip-color, var(--ulvia-field-text, var(--text-main, inherit)));
                    font: inherit;
                    cursor: pointer;
                }

                :host([selected]) button {
                    border-color: var(--cms-chip-selected-border, var(--ulvia-action-background, var(--primary-base, CanvasText)));
                    background: var(--cms-chip-selected-background, var(--ulvia-action-background, var(--primary-base, CanvasText)));
                    color: var(--cms-chip-selected-color, var(--cms-chip-color, var(--ulvia-action-text, var(--primary-foreground, var(--primary-contrasted, Canvas)))));
                }

                button:focus-visible {
                    outline: 2px solid var(--cms-focus-color, var(--ulvia-focus-color, var(--primary-base, CanvasText)));
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
            new CustomEvent("basic-chip:toggle", {
                bubbles: true,
                composed: true,
                detail: { value: this.value },
            }),
        );
    };
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicChip);

export class BasicCard extends HTMLElement {
    static observedAttributes = ["background-color", "border-color", "muted-text-color", "text-color"];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.render();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.syncColors();
        }
    }

    render() {
        this.root.innerHTML = `
            <style>
                :host {
                    display: block;
                    color: inherit;
                    font: inherit;
                }

                :host([stretch]:not([stretch="false"])) { height: 100%; }
                :host([stretch]:not([stretch="false"])) [part="card"] {
                    min-height: 100%;
                    grid-template-rows: auto auto 1fr auto;
                }

                [part="card"] {
                    box-sizing: border-box;
                    display: grid;
                    gap: var(--cms-card-section-gap, 1.25rem);
                    padding: var(--cms-card-padding, 1.5rem);
                    border: var(--cms-card-border, 1px solid var(--cms-card-border-color, var(--border-subtle, color-mix(in srgb, currentColor 16%, transparent))));
                    border-radius: var(--cms-card-radius, var(--radius-lg, 1rem));
                    background: var(--cms-card-background, var(--bg-surface, Canvas));
                    color: var(--cms-card-color, var(--text-main, inherit));
                    box-shadow: var(--cms-card-shadow, none);
                }

                [part="header"] {
                    display: grid;
                    gap: .25rem;
                }

                [part="body"] {
                    display: grid;
                    gap: var(--cms-card-content-gap, 1rem);
                    min-width: 0;
                }

                [part="actions"] {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: var(--cms-card-actions-gap, .75rem);
                }

                ::slotted([slot="media"]) {
                    display: block;
                    width: 100%;
                    max-width: 100%;
                }

                ::slotted([slot="title"]) {
                    margin: 0;
                    color: inherit;
                    font-family: var(--font-display, inherit);
                    font-size: var(--cms-card-title-size, 1.25rem);
                    font-weight: 700;
                    line-height: 1.2;
                }

                ::slotted([slot="description"]) {
                    margin: 0;
                    color: var(--cms-card-muted-color, var(--text-muted, color-mix(in srgb, currentColor 68%, transparent)));
                }

                :host(:not(:has([slot="media"]))) [part="media"],
                :host(:not(:has([slot="title"], [slot="description"]))) [part="header"],
                :host(:not(:has([slot="actions"]))) [part="actions"] { display: none; }

                :host([appearance="plain"]) [part="card"] {
                    border-color: var(--cms-card-border-color, transparent);
                    background: var(--cms-card-background, transparent);
                    box-shadow: none;
                }

                :host([appearance="elevated"]) [part="card"] {
                    border-color: var(--cms-card-border-color, transparent);
                    box-shadow: var(--cms-card-shadow, var(--ctx-shadow-rest, 0 .5rem 1.5rem color-mix(in srgb, currentColor 12%, transparent)));
                }

                :host([density="compact"]) [part="card"] {
                    --cms-card-padding: 1rem;
                    --cms-card-section-gap: .75rem;
                    --cms-card-content-gap: .75rem;
                }

                :host([density="spacious"]) [part="card"] {
                    --cms-card-padding: 2rem;
                    --cms-card-section-gap: 1.5rem;
                    --cms-card-content-gap: 1.25rem;
                }
            </style>
            <section part="card">
                <div part="media"><slot name="media"></slot></div>
                <header part="header">
                    <slot name="title"></slot>
                    <slot name="description"></slot>
                </header>
                <div part="body"><slot></slot></div>
                <footer part="actions"><slot name="actions"></slot></footer>
            </section>
        `;
        this.card = this.root.querySelector('[part="card"]');
        this.syncColors();
    }

    syncColors() {
        if (!this.card) {
            return;
        }
        for (const [attribute, property] of [
            ["background-color", "--cms-card-background"],
            ["border-color", "--cms-card-border-color"],
            ["muted-text-color", "--cms-card-muted-color"],
            ["text-color", "--cms-card-color"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.card.style.setProperty(property, value);
            } else {
                this.card.style.removeProperty(property);
            }
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicCard);

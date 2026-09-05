import { mossaColorSchemeCss } from "./colorSchemes";

export class MossaSurfaceCard extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.root.innerHTML = `
            <style>
                ${mossaColorSchemeCss("neutral")}

                :host {
                    display: block;
                    color: inherit;
                    font: inherit;
                    --_mossa-card-background: var(--_mossa-tone-foreground);
                    --_mossa-card-border: var(--_mossa-tone-border);
                    --_mossa-card-color: var(--_mossa-tone-contrasted);
                    --_mossa-card-muted: color-mix(in srgb, var(--_mossa-card-color) 68%, transparent);
                    --_mossa-card-shadow: none;
                }

                :host([hidden]) { display: none !important; }

                :host([stretch]:not([stretch="false"])) { height: 100%; }
                :host([stretch]:not([stretch="false"])) [part="card"] {
                    min-height: 100%;
                    grid-template-rows: auto auto 1fr auto;
                }

                [part="card"] {
                    box-sizing: border-box;
                    display: grid;
                    gap: var(--_mossa-card-section-gap, calc(var(--ulvia-space-md) + var(--ulvia-space-xs)));
                    padding: var(--_mossa-card-padding, var(--ulvia-space-lg));
                    border: 1px solid var(--_mossa-card-border);
                    border-radius: var(--_mossa-card-radius, var(--ulvia-radius-card));
                    background: var(--_mossa-card-background);
                    color: var(--_mossa-card-color);
                    box-shadow: var(--_mossa-card-shadow);
                }

                [part="header"] {
                    display: grid;
                    gap: .25rem;
                }

                [part="body"] {
                    display: grid;
                    gap: var(--_mossa-card-content-gap, var(--ulvia-space-md));
                    min-width: 0;
                }

                [part="actions"] {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: var(--_mossa-card-actions-gap, calc(var(--ulvia-space-sm) + var(--ulvia-space-xs)));
                }

                ::slotted([slot="media"]) {
                    display: block;
                    width: 100%;
                    max-width: 100%;
                }

                ::slotted([slot="title"]) {
                    margin: 0;
                    color: inherit;
                    font-family: var(--_mossa-card-title-font, var(--ulvia-font-heading));
                    font-size: var(--_mossa-card-title-size, 1.25rem);
                    font-weight: 700;
                    line-height: 1.2;
                }

                ::slotted([slot="description"]) {
                    margin: 0;
                    color: var(--_mossa-card-muted-color, var(--_mossa-card-muted));
                }

                :host(:not(:has([slot="media"]))) [part="media"],
                :host(:not(:has([slot="title"], [slot="description"]))) [part="header"],
                :host(:not(:has([slot="actions"]))) [part="actions"] { display: none; }

                :host([appearance="filled"]) {
                    --_mossa-card-background: var(--_mossa-tone-base);
                    --_mossa-card-color: var(--_mossa-tone-foreground);
                    --_mossa-card-border: var(--_mossa-tone-base);
                }

                :host([appearance="soft"]) {
                    --_mossa-card-background: var(--_mossa-tone-muted);
                    --_mossa-card-color: var(--_mossa-tone-contrasted);
                    --_mossa-card-border: var(--_mossa-tone-muted);
                }

                :host([appearance="ghost"]) {
                    --_mossa-card-background: transparent;
                    --_mossa-card-border: transparent;
                    --_mossa-card-color: var(--_mossa-tone-contrasted);
                }

                :host([elevation="elevated"]) {
                    --_mossa-card-shadow: var(--ulvia-shadow-soft);
                }

                :host([density="compact"]) [part="card"] {
                    --_mossa-card-padding: 1rem;
                    --_mossa-card-section-gap: .75rem;
                    --_mossa-card-content-gap: .75rem;
                }

                :host([density="spacious"]) [part="card"] {
                    --_mossa-card-padding: 2rem;
                    --_mossa-card-section-gap: 1.5rem;
                    --_mossa-card-content-gap: 1.25rem;
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
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaSurfaceCard);

export class BasicPanel extends HTMLElement {
    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.root.innerHTML = `
            <style>
                :host {
                    display: block;
                    font: inherit;
                    color: inherit;
                }

                [part="panel"] {
                    display: grid;
                    gap: var(--cms-panel-gap, 1rem);
                    padding: var(--cms-panel-padding, 1rem);
                    border: var(--cms-panel-border, 1px solid color-mix(in srgb, currentColor 16%, transparent));
                    border-radius: var(--cms-panel-radius, .5rem);
                    background: var(--cms-panel-background, transparent);
                }
            </style>
            <section part="panel">
                <slot></slot>
            </section>
        `;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicPanel);

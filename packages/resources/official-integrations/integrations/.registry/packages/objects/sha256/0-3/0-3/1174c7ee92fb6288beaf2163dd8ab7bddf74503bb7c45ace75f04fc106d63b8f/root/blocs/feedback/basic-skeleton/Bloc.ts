import { basicColorSchemeCss } from "./colorSchemes";

export class BasicSkeleton extends HTMLElement {
    static observedAttributes = ["animation", "aria-hidden", "height", "label", "radius", "shape", "width"];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        this.render();
        this.syncPresentation();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.syncPresentation();
        }
    }

    render() {
        this.root.innerHTML = `
            <style>
                ${basicColorSchemeCss("neutral")}

                :host {
                    --cms-skeleton-base: var(--_tone-muted);
                    --cms-skeleton-highlight: color-mix(in srgb, var(--_tone-contrasted) 10%, var(--_tone-muted));
                    --cms-skeleton-height: 1rem;
                    --cms-skeleton-radius: var(--radius-sm, .4rem);
                    --cms-skeleton-width: 100%;
                    display: block;
                    width: var(--cms-skeleton-width);
                    max-width: 100%;
                    height: var(--cms-skeleton-height);
                    overflow: hidden;
                    border-radius: var(--cms-skeleton-radius);
                    background: var(--cms-skeleton-base);
                    color: inherit;
                }

                [part="surface"] {
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(
                        100deg,
                        transparent 20%,
                        var(--cms-skeleton-highlight) 50%,
                        transparent 80%
                    );
                    background-size: 220% 100%;
                    animation: cms-skeleton-wave 1.45s ease-in-out infinite;
                }

                :host([appearance="filled"]) {
                    --cms-skeleton-base: var(--_tone-base);
                    --cms-skeleton-highlight: color-mix(in srgb, var(--_tone-foreground) 22%, var(--_tone-base));
                }

                :host([animation="pulse"]) [part="surface"] {
                    background: var(--cms-skeleton-highlight);
                    animation: cms-skeleton-pulse 1.35s ease-in-out infinite alternate;
                }

                :host([animation="none"]) [part="surface"] { animation: none; }

                :host([shape="circle"]) {
                    width: var(--cms-skeleton-height);
                    border-radius: 50%;
                }

                @keyframes cms-skeleton-wave {
                    from { background-position: 180% 0; }
                    to { background-position: -80% 0; }
                }

                @keyframes cms-skeleton-pulse {
                    from { opacity: .35; }
                    to { opacity: 1; }
                }

                @media (prefers-reduced-motion: reduce) {
                    [part="surface"] { animation: none; }
                }
            </style>
            <div part="surface" aria-hidden="true"></div>
        `;
    }

    syncPresentation() {
        for (const [attribute, property] of [
            ["height", "--cms-skeleton-height"],
            ["radius", "--cms-skeleton-radius"],
            ["width", "--cms-skeleton-width"],
        ]) {
            const value = this.getAttribute(attribute)?.trim();
            if (value) {
                this.style.setProperty(property, value);
            } else {
                this.style.removeProperty(property);
            }
        }

        if (this.getAttribute("aria-hidden") === "true") {
            this.removeAttribute("role");
            this.removeAttribute("aria-label");
        } else {
            const label = this.getAttribute("label")?.trim() || "Loading";
            this.setAttribute("role", "status");
            this.setAttribute("aria-label", label);
        }
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", BasicSkeleton);

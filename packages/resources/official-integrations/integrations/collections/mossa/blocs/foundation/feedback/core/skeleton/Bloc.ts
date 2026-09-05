import { mossaColorSchemeCss } from "./colorSchemes";

export class MossaSkeleton extends HTMLElement {
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
                ${mossaColorSchemeCss("neutral")}

                :host {
                    --_mossa-skeleton-base: var(--_mossa-tone-muted);
                    --_mossa-skeleton-highlight: color-mix(in srgb, var(--_mossa-tone-contrasted) 10%, var(--_mossa-tone-muted));
                    --_mossa-skeleton-height: 1rem;
                    --_mossa-skeleton-radius: var(--ulvia-radius-sm);
                    --_mossa-skeleton-width: 100%;
                    display: block;
                    width: var(--_mossa-skeleton-width);
                    max-width: 100%;
                    height: var(--_mossa-skeleton-height);
                    overflow: hidden;
                    border-radius: var(--_mossa-skeleton-radius);
                    background: var(--_mossa-skeleton-base);
                    color: inherit;
                }

                [part="surface"] {
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(
                        100deg,
                        transparent 20%,
                        var(--_mossa-skeleton-highlight) 50%,
                        transparent 80%
                    );
                    background-size: 220% 100%;
                    animation: cms-skeleton-wave 1.45s ease-in-out infinite;
                }

                :host([appearance="filled"]) {
                    --_mossa-skeleton-base: var(--_mossa-tone-base);
                    --_mossa-skeleton-highlight: color-mix(in srgb, var(--_mossa-tone-foreground) 22%, var(--_mossa-tone-base));
                }

                :host([animation="pulse"]) [part="surface"] {
                    background: var(--_mossa-skeleton-highlight);
                    animation: cms-skeleton-pulse 1.35s ease-in-out infinite alternate;
                }

                :host([animation="none"]) [part="surface"] { animation: none; }

                :host([shape="circle"]) {
                    width: var(--_mossa-skeleton-height);
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
            ["height", "--_mossa-skeleton-height"],
            ["radius", "--_mossa-skeleton-radius"],
            ["width", "--_mossa-skeleton-width"],
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

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaSkeleton);

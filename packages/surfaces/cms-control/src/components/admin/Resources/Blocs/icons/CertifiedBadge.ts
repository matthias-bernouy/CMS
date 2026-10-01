const TEMPLATE = `
    <style>
        :host {
            color: var(--success-base);
            display: inline-flex;
            flex: none;
            height: 17px;
            width: 17px;
        }
        svg { fill: currentColor; height: 100%; overflow: visible; width: 100%; }
        .check {
            fill: none;
            stroke: var(--bg-surface);
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: 2.1;
        }
    </style>
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2 2.2 2.1 3-.1.8 2.9 2.5 1.7-1.1 2.8 1.1 2.8-2.5 1.7-.8 2.9-3-.1L12 22l-2.2-2.1-3 .1-.8-2.9-2.5-1.7 1.1-2.8-1.1-2.8L6 7.1 6.8 4.2l3 .1L12 2Z"></path>
        <path class="check" d="m8.3 12.2 2.3 2.3 5.1-5.2"></path>
    </svg>
`;

export class CertifiedBadge extends HTMLElement {
    static get observedAttributes(): string[] {
        return ["label"];
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = TEMPLATE;
    }

    connectedCallback(): void {
        this.syncLabel();
    }

    attributeChangedCallback(): void {
        this.syncLabel();
    }

    private syncLabel(): void {
        const label = this.getAttribute("label") ?? "Certified official Ulvia resource";
        this.setAttribute("role", "img");
        this.setAttribute("aria-label", label);
        this.title = label;
    }
}

if (!customElements.get("cms-certified-badge")) {
    customElements.define("cms-certified-badge", CertifiedBadge);
}

const template = document.createElement("template");
template.innerHTML = `
    <style>
        :host {
            display: block;
            min-width: 0;
            color: #0f1f1a;
        }

        .cell {
            display: grid;
            gap: 2px;
            min-width: 0;
        }

        .title {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        :host([primary]) .title {
            font-weight: 700;
        }

        small {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: #66736f;
        }

        small:empty {
            display: none;
        }

        :host([tone="badge"]) .title {
            justify-self: start;
            border-radius: 999px;
            background: #edf7f0;
            color: #105d3e;
            font-size: 12px;
            font-weight: 750;
            padding: 3px 8px;
        }

        :host([tone="muted"]) {
            color: #66736f;
        }
    </style>
    <span class="cell">
        <span class="title"><slot></slot></span>
        <small data-meta></small>
    </span>
`;

export class DashboardWCell extends HTMLElement {
    static get observedAttributes(): string[] {
        return ["meta"];
    }

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.render();
    }

    attributeChangedCallback(): void {
        this.render();
    }

    private render(): void {
        const meta = this.shadowRoot?.querySelector<HTMLElement>("[data-meta]");
        if (meta) {
            meta.textContent = this.getAttribute("meta") ?? "";
        }
    }
}

if (!customElements.get("cms-dashboard-w-cell")) {
    customElements.define("cms-dashboard-w-cell", DashboardWCell);
}

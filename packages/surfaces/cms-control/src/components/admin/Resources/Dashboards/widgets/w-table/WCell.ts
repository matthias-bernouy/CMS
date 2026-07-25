import { formatDashboardValue } from "../../domain/formatting";

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

        .title,
        [data-formatted] {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        [data-formatted][hidden],
        :host([data-display-format]) slot {
            display: none;
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
        <span class="title"><slot></slot><span data-formatted hidden></span></span>
        <small data-meta></small>
    </span>
`;

export class DashboardWCell extends HTMLElement {
    static get observedAttributes(): string[] {
        return ["data-display-currency", "data-display-format", "data-display-value", "meta"];
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
        const formatted = this.shadowRoot?.querySelector<HTMLElement>("[data-formatted]");
        const format = this.dataset.displayFormat;
        if (formatted) {
            const active = format === "date" || format === "money";
            formatted.hidden = !active;
            formatted.textContent = active
                ? formatDashboardValue(this.dataset.displayValue, format, {
                      currency: this.dataset.displayCurrency,
                  })
                : "";
            if (active) {
                formatted.title = formatted.textContent;
            } else {
                formatted.removeAttribute("title");
            }
        }
    }
}

if (!customElements.get("cms-dashboard-w-cell")) {
    customElements.define("cms-dashboard-w-cell", DashboardWCell);
}

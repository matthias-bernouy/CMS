import { emitWidgetEvent, WIDGET_ROW_SELECT_EVENT } from "../shared";

const template = document.createElement("template");
template.innerHTML = `
    <style>
        :host {
            display: block;
        }

        .row {
            display: grid;
            grid-template-columns: var(--dashboard-table-columns, 46px 1fr);
            align-items: center;
            min-height: 54px;
            border-top: 1px solid #e8ecea;
            cursor: default;
            min-width: 0;
        }

        :host([collection]) .row {
            cursor: pointer;
        }

        :host([collection]) .row:hover,
        :host([selected]) .row {
            background: #f3f7f5;
        }

        .check {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 0;
        }

        input {
            margin: 0;
        }

        slot {
            display: contents;
        }

        ::slotted(cms-dashboard-w-cell) {
            min-width: 0;
            padding: 12px 16px;
        }
    </style>
    <div class="row" role="row" tabindex="0">
        <span class="check" role="cell">
            <input type="checkbox" data-check aria-label="Select row">
        </span>
        <slot></slot>
    </div>
`;

export class DashboardWRow extends HTMLElement {
    private readonly onClick = (event: Event): void => {
        if ((event.target as Element | null)?.closest("input")) {
            return;
        }
        this.select();
    };

    private readonly onKeydown = (event: Event): void => {
        const key = event instanceof KeyboardEvent ? event.key : "";
        if (key !== "Enter" && key !== " ") {
            return;
        }
        event.preventDefault();
        this.select();
    };

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this.shadowRoot?.querySelector("[data-check]")?.setAttribute("aria-label", `Select row ${this.rowKey}`);
        this.shadowRoot?.querySelector(".row")?.addEventListener("click", this.onClick);
        this.shadowRoot?.querySelector(".row")?.addEventListener("keydown", this.onKeydown);
    }

    disconnectedCallback(): void {
        this.shadowRoot?.querySelector(".row")?.removeEventListener("click", this.onClick);
        this.shadowRoot?.querySelector(".row")?.removeEventListener("keydown", this.onKeydown);
    }

    get rowKey(): string {
        return this.getAttribute("row-key") ?? "";
    }

    get collection(): string {
        return this.getAttribute("collection") ?? "";
    }

    set checked(value: boolean) {
        const input = this.shadowRoot?.querySelector<HTMLInputElement>("[data-check]");
        if (input) {
            input.checked = value;
        }
    }

    private select(): void {
        if (!this.collection || !this.rowKey) {
            return;
        }
        emitWidgetEvent(this, WIDGET_ROW_SELECT_EVENT, { collection: this.collection, rowKey: this.rowKey });
    }
}

if (!customElements.get("cms-dashboard-w-row")) {
    customElements.define("cms-dashboard-w-row", DashboardWRow);
}

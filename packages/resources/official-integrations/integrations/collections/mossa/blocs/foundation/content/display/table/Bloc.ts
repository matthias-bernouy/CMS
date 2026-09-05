import { Component } from "@bernouy/components/base";

import css from "./style.css" with { type: "text" };
import { parseTableData } from "./tableData";
import template from "./template.html" with { type: "text" };

export class MossaTable extends Component {
    static observedAttributes = ["accessible-label", "caption", "columns", "rows"];

    constructor() {
        super({ css, template });
    }

    connectedCallback(): void {
        this.renderTable();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.renderTable();
        }
    }

    private renderTable(): void {
        const table = this.shadowRoot?.querySelector<HTMLTableElement>("table");
        const caption = this.shadowRoot?.querySelector<HTMLTableCaptionElement>("caption");
        const header = this.shadowRoot?.querySelector<HTMLTableRowElement>("thead tr");
        const body = this.shadowRoot?.querySelector<HTMLTableSectionElement>("tbody");
        if (!table || !caption || !header || !body) {
            return;
        }

        const data = parseTableData(this.getAttribute("columns"), this.getAttribute("rows"));
        const captionValue = this.getAttribute("caption")?.trim() ?? "";
        const accessibleLabel = this.getAttribute("accessible-label")?.trim() ?? "";
        caption.textContent = captionValue;
        caption.hidden = !captionValue;
        if (accessibleLabel) {
            table.setAttribute("aria-label", accessibleLabel);
        } else {
            table.removeAttribute("aria-label");
        }

        header.replaceChildren(...(data?.columns.map(createHeaderCell) ?? []));
        body.replaceChildren(...(data?.rows.map(createRow) ?? []));
        this.toggleAttribute("data-invalid", data === null);
    }
}

function createHeaderCell(value: string): HTMLTableCellElement {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = value;
    return cell;
}

function createRow(values: string[]): HTMLTableRowElement {
    const row = document.createElement("tr");
    row.replaceChildren(
        ...values.map((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            return cell;
        }),
    );
    return row;
}

customElements.define("BE5_TAG_TO_BE_REPLACED", MossaTable);

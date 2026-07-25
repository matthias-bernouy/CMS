import "./WCell";
import { type DashboardWRow } from "./WRow";
import "./WRow";
import { setP9rButtonLabel, setP9rButtonTone } from "../shared";
import type { WTableColumn, WTableData, WTableRow } from "./types";

export function tableActionButtons(actions: NonNullable<WTableData["actions"]>): HTMLElement[] {
    return actions.map((action) => {
        const button = document.createElement("p9r-button");
        button.dataset.action = action.action;
        if (action.widget) {
            button.dataset.widget = action.widget;
        }
        if (action.target) {
            button.dataset.target = action.target;
        }
        if (action.confirm) {
            button.dataset.confirm = action.confirm;
        }
        setP9rButtonTone(button, action.tone ?? "primary");
        setP9rButtonLabel(button, action.label);
        return button;
    });
}

export function renderTableColumns(host: HTMLElement, head: HTMLElement, columns: WTableColumn[]): void {
    head.querySelectorAll("[data-column-header]").forEach((element) => element.remove());
    host.style.setProperty("--dashboard-table-columns", tableColumns(columns));
    for (const column of columns) {
        const header = document.createElement("span");
        header.dataset.columnHeader = column.key;
        header.setAttribute("role", "columnheader");
        header.textContent = column.label;
        head.append(header);
    }
}

export function createTableRow(row: WTableRow, columns: WTableColumn[]): DashboardWRow {
    const element = document.createElement("cms-dashboard-w-row") as DashboardWRow;
    element.setAttribute("row-key", row.id);
    if (row.collection) {
        element.setAttribute("collection", row.collection);
    }
    for (const column of columns) {
        const cell = document.createElement("cms-dashboard-w-cell");
        const value = row.cells[column.key];
        if (column.primary) {
            cell.toggleAttribute("primary", true);
        }
        if (typeof value === "object") {
            if (value.tone) {
                cell.setAttribute("tone", value.tone);
            }
            if (value.meta) {
                cell.setAttribute("meta", value.meta);
            }
            cell.textContent = value.title;
        } else {
            cell.textContent = value ?? "";
        }
        element.append(cell);
    }
    return element;
}

function tableColumns(columns: WTableColumn[]): string {
    return ["46px", ...columns.map((column) => column.width ?? "minmax(7rem, 1fr)")].join(" ");
}

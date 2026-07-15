import type { DashboardWidget } from "@bernouy/cms-dashboards";
import type { WTableCell, WTableData, WTableRow } from "../../widgets/w-table/types";
import { pathLabel, textAt } from "../expressions";

type TableWidget = Extract<DashboardWidget, { widget: "w-table" }>;

export function tableData(widget: TableWidget, items: unknown[]): WTableData {
    return {
        title: widget.title ?? pathLabel(widget.source.endpoint),
        actions: (widget.actions ?? []).map(action => ({
            label: action.label,
            action: action.id,
            ...(action.selection?.opens ? { target: action.selection.opens } : {}),
            tone: action.tone,
        })),
        columns: widget.columns.map(column => ({
            key: column.id,
            label: column.label,
            ...(column.width ? { width: column.width } : {}),
            ...(column.primary ? { primary: true } : {}),
        })),
        rows: items.map(item => tableRow(widget, item)),
    };
}

function tableRow(widget: TableWidget, item: unknown): WTableRow {
    return {
        id: textAt(item, widget.rowKey),
        collection: widget.selection?.opens ?? widget.id,
        cells: Object.fromEntries(widget.columns.map(column => [column.id, tableCell(item, column)])),
    };
}

function tableCell(item: unknown, column: TableWidget["columns"][number]): WTableCell {
    const value = textAt(item, column.path);
    if (column.format === "badge") return { title: value, tone: "badge" };
    if (column.primary) return { title: value, meta: textAt(item, "id") };
    return value;
}

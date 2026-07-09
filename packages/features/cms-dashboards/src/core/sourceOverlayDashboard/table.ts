import { sourceOverlayFieldPath, type SourceOverlay } from "@bernouy/cms-sources";
import type { DashboardWidget } from "../../interfaces/Dashboard";
import { overlayFieldId } from "./fieldHelpers";

type TableWidget = Extract<DashboardWidget, { widget: "w-table" }>;

export function addOverlayTableColumns(widget: TableWidget, overlay: SourceOverlay): TableWidget {
    const columns = [...widget.columns];
    for (const field of overlay.fields.filter(field => field.showInDashboardTable === true)) {
        const id = overlayFieldId(field);
        if (columns.some(column => column.id === id)) continue;
        columns.push({ id, label: field.label, path: sourceOverlayFieldPath(field) });
    }
    return { ...widget, columns };
}

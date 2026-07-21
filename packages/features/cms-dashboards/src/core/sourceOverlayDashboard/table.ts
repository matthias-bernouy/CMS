import { sourceOverlayFieldPath, type SourceOverlay } from "@bernouy/cms-sources";
import type { DashboardWidget } from "../../interfaces/Dashboard";
import { joinedPath, normalizedTargetPath, overlayFieldId } from "./fieldHelpers";

type TableWidget = Extract<DashboardWidget, { widget: "w-table" }>;

export function addOverlayTableColumns(widget: TableWidget, overlay: SourceOverlay): TableWidget {
    const prefixes = (overlay.output ?? [])
        .filter((target) => target.endpointId === widget.source.endpoint)
        .map((target) => tableTargetPrefix(target.path, widget.source.itemsPath))
        .filter((prefix): prefix is string => prefix !== null);
    if (!prefixes.length) {
        return widget;
    }
    const columns = [...widget.columns];
    for (const prefix of prefixes) {
        for (const field of overlay.fields.filter((field) => field.showInDashboardTable === true)) {
            const id = overlayFieldId(field, prefix);
            if (columns.some((column) => column.id === id)) {
                continue;
            }
            columns.push({ id, label: field.label, path: joinedPath(prefix, sourceOverlayFieldPath(field)) });
        }
    }
    return { ...widget, columns };
}

function tableTargetPrefix(targetPath: string | undefined, itemsPath: string | undefined): string | null {
    const target = normalizedTargetPath(targetPath);
    const items = normalizedTargetPath(itemsPath);
    if (!items) {
        return target;
    }
    if (target === items) {
        return "";
    }
    return target.startsWith(`${items}.`) ? target.slice(items.length + 1) : null;
}

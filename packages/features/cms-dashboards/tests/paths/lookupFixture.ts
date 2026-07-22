import type { DashboardEmbeddedLookupRef } from "@bernouy/cms-dashboards";

export function lookup(selected: DashboardEmbeddedLookupRef["selected"]): DashboardEmbeddedLookupRef {
    return {
        endpoint: "options",
        itemsPath: "items",
        valuePath: "id",
        labelPath: "label",
        selected,
    };
}

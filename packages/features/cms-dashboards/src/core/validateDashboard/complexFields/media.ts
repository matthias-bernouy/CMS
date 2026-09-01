import type { Source } from "@bernouy/cms-sources";
import type { DashboardDto, DashboardField } from "cms-dashboards/interfaces/Dashboard";
import { validateEndpointRef } from "../endpointRefs";
import { validatePath, validateRequiredPath } from "../shared";

export function validateMediaField(
    field: Extract<DashboardField, { type: "media" }>,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    validateMediaDefinition(field, path, dashboard, source, errors);
}

export function validateMediaDefinition(
    field: Pick<Extract<DashboardField, { type: "media" }>, "item" | "actions">,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    validatePath("item.idPath", field.item.idPath, path, errors);
    validateRequiredPath("item.urlPath", field.item.urlPath, path, errors);
    validatePath("item.altPath", field.item.altPath, path, errors);
    if (!field.actions) {
        return;
    }
    for (const [action, reference] of Object.entries(field.actions)) {
        if (reference) {
            validateEndpointRef(dashboard, reference, `${path}.actions.${action}`, source, errors);
        }
    }
}

import { makeSourceUrn, type Source } from "@bernouy/cms-sources";
import type { DashboardDto } from "../interfaces/Dashboard";
import { validateRequiredId } from "./validateDashboard/shared";
import { collectWidgetIds, validateWidget } from "./validateDashboard/widgets";

export type ValidateDashboardOptions = {
    source?: Source | null;
};

export function validateDashboard(dashboard: DashboardDto, options: ValidateDashboardOptions = {}): string[] {
    const errors: string[] = [];
    const source = options.source ?? null;

    validateRequiredId("dashboard.id", dashboard.id, errors);
    validateRequiredId("dashboard.source", dashboard.source, errors);
    if (source && source.urn !== makeSourceUrn(dashboard.source)) {
        errors.push(`dashboard source "${dashboard.source}" does not match source "${source.urn}"`);
    }
    if (!Array.isArray(dashboard.views) || dashboard.views.length === 0) {
        errors.push("views must contain at least one widget");
        return errors;
    }

    const widgetIds = new Set<string>();
    collectWidgetIds(dashboard.views, "views", widgetIds, errors);
    dashboard.views.forEach((widget, index) =>
        validateWidget(widget, `views.${index}`, dashboard, source, widgetIds, errors));
    return errors;
}

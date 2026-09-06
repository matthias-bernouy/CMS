import type { Source } from "@bernouy/cms-sources";
import type { DashboardAction, DashboardDto, DashboardWidget } from "../../interfaces/Dashboard";
import { isSafeDashboardExpression } from "../dashboardPaths";
import { validateEndpointRef } from "./endpointRefs";
import { isSafeDownloadFilename, isSafeActionAfterExpression, validateRequiredId, validateVisibility } from "./shared";

export function validateAction(
    action: DashboardAction,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
    visibilityFieldIds?: ReadonlySet<string>,
): void {
    validateRequiredId(`${path}.id`, action.id, errors);
    if (!action.label) {
        errors.push(`${path}.label is required`);
    }
    if (action.placement !== undefined && !["primary", "secondary", "more"].includes(action.placement)) {
        errors.push(`${path}.placement is not supported`);
    }
    if (action.tone !== undefined && !["primary", "secondary", "danger"].includes(action.tone)) {
        errors.push(`${path}.tone is not supported`);
    }
    if (action.section !== undefined && !action.section.trim()) {
        errors.push(`${path}.section must be non-empty when provided`);
    }
    if (action.visibleWhen !== undefined) {
        if (!visibilityFieldIds) {
            errors.push(`${path}.visibleWhen is only supported on detail actions`);
        } else {
            validateVisibility(action.visibleWhen, `${path}.visibleWhen`, errors, visibilityFieldIds);
        }
    }
    if (!action.endpoint && !action.selection && !action.management) {
        errors.push(`${path} must declare endpoint, management, or selection`);
    }
    if (action.management) {
        validateRequiredId(`${path}.management.installationId`, action.management.installationId, errors);
        if (!["save-settings", "action"].includes(action.management.action) || action.endpoint || action.download) {
            errors.push(`${path}.management requires save-settings or action and cannot declare endpoint or download`);
        }
        if (action.management.action === "action") {
            validateRequiredId(`${path}.management.actionId`, action.management.actionId, errors);
        } else if (action.management.actionId !== undefined) {
            errors.push(`${path}.management.actionId requires action`);
        }
        for (const expression of Object.values(action.management.body ?? {})) {
            if (
                expression.startsWith("$") &&
                !isSafeDashboardExpression(expression, ["row", "resource", "field", "result"])
            ) {
                errors.push(`${path}.management.body must use safe expressions`);
            }
        }
    }
    if (action.endpoint) {
        validateEndpointRef(dashboard, action.endpoint, `${path}.endpoint`, source, errors);
    }
    if (action.download !== undefined) {
        if (!action.endpoint) {
            errors.push(`${path}.download requires endpoint`);
        }
        if (action.download.filename !== undefined && !isSafeDownloadFilename(action.download.filename)) {
            errors.push(`${path}.download.filename must be a safe file name`);
        }
    }
    if (action.selection?.opens && !findWidget(dashboard.views, action.selection.opens)) {
        errors.push(`${path}.selection.opens references unknown widget "${action.selection.opens}"`);
    }
    if (action.after) {
        if (!action.endpoint && !action.management) {
            errors.push(`${path}.after requires endpoint or management`);
        }
        validateActionAfter(action, `${path}.after`, dashboard, errors, visibilityFieldIds !== undefined);
    }
}

function validateActionAfter(
    action: DashboardAction,
    path: string,
    dashboard: DashboardDto,
    errors: string[],
    detailAction: boolean,
): void {
    const after = action.after!;
    const hasOpens = after.opens !== undefined;
    const hasResource = after.resource !== undefined;
    if (!hasOpens && !hasResource) {
        errors.push(`${path} must declare opens or resource`);
    }
    if (hasOpens) {
        validateRequiredId(`${path}.opens`, after.opens, errors);
        if (after.opens && !findWidget(dashboard.views, after.opens)) {
            errors.push(`${path}.opens references unknown widget "${after.opens}"`);
        }
    }
    if (after.row !== undefined) {
        if (!hasOpens) {
            errors.push(`${path}.row requires opens`);
        }
        validateActionAfterExpression(`${path}.row`, after.row, errors);
    }
    if (hasResource) {
        if (typeof after.resource !== "string" || !isSafeDashboardExpression(after.resource, ["result"])) {
            errors.push(`${path}.resource must be a safe $result expression`);
        }
        if (!hasOpens && !detailAction) {
            errors.push(`${path}.resource requires after.opens on collection actions`);
        }
        if (action.download !== undefined) {
            errors.push(`${path}.resource is not supported with download`);
        }
    }
}

function validateActionAfterExpression(path: string, value: string, errors: string[]): void {
    if (!value.startsWith("$")) {
        return;
    }
    if (!isSafeActionAfterExpression(value)) {
        errors.push(`${path} has an invalid binding expression`);
    }
}

function findWidget(widgets: DashboardWidget[], id: string): DashboardWidget | null {
    for (const widget of widgets) {
        if (widget.id === id) {
            return widget;
        }
        if (widget.widget === "w-section") {
            const found = findWidget(widget.children, id);
            if (found) {
                return found;
            }
        }
        if (widget.widget === "w-tabs") {
            for (const tab of widget.tabs) {
                const found = findWidget(tab.children, id);
                if (found) {
                    return found;
                }
            }
        }
    }
    return null;
}

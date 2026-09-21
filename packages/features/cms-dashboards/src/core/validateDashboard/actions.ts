import { validateActionSelection } from "./shared/selection";
import { validateFormOperation } from "./shared/forms/operation";
import { validateOperationFields } from "./shared/forms/creation";
import type { Source } from "@bernouy/cms-sources";
import type { DashboardAction, DashboardDto, DashboardWidget } from "../../interfaces/Dashboard";
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
    if (action.form !== undefined) {
        if (
            action.endpoint ||
            action.selection ||
            action.download ||
            (action.after && Object.hasOwn(action.after, "resource"))
        ) {
            errors.push(`${path}.form cannot combine endpoint, selection, download, or after.resource`);
        }
        validateFormOperation(action.form, `${path}.form`, dashboard, source, errors, action.form?.fields ?? []);
        if (action.form?.fields !== undefined) {
            validateOperationFields(action.form.fields, `${path}.form.fields`, dashboard, source, errors);
        }
    }
    if (!action.endpoint && !action.selection && !action.form) {
        errors.push(`${path} must declare endpoint, selection, or form`);
    }
    if (action.endpoint) {
        validateEndpointRef(dashboard, action.endpoint, `${path}.endpoint`, source, errors);
        if (!action.download) {
            errors.push(`${path}.endpoint is only supported for downloads: use form for mutations`);
        }
    }
    if (action.download !== undefined) {
        if (!action.endpoint) {
            errors.push(`${path}.download requires endpoint`);
        }
        if (action.download.filename !== undefined && !isSafeDownloadFilename(action.download.filename)) {
            errors.push(`${path}.download.filename must be a safe file name`);
        }
    }
    validateActionSelection(
        action,
        path,
        findWidget(dashboard.views, action.selection?.opens ?? ""),
        errors,
        visibilityFieldIds !== undefined,
    );
    if (action.after) {
        if (!action.form) {
            errors.push(`${path}.after requires a native form`);
        }
        validateActionAfter(action, `${path}.after`, dashboard, errors);
    }
}

function validateActionAfter(action: DashboardAction, path: string, dashboard: DashboardDto, errors: string[]): void {
    const after = action.after!;
    const hasOpens = after.opens !== undefined;
    const hasResource = Object.hasOwn(after, "resource");
    if (!hasOpens) {
        errors.push(`${path} must declare opens`);
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
        errors.push(`${path}.resource is obsolete: reload the common source`);
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

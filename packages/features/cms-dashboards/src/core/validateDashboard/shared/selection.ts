import type { DashboardAction, DashboardWidget } from "../../../interfaces/Dashboard";
import { isSafeDashboardExpression } from "../../dashboardPaths";

/** Explicit action destinations use stable identities, never a mutation result or editable draft. */
export function validateActionSelection(
    action: DashboardAction,
    path: string,
    target: DashboardWidget | null,
    errors: string[],
    detail: boolean,
): void {
    const selection = action.selection;
    if (!selection) {
        return;
    }
    if (!selection.opens || !target) {
        errors.push(`${path}.selection.opens references an unknown widget`);
    }
    if (selection.row === undefined) {
        if (detail) {
            errors.push(`${path}.selection.row is required on detail actions`);
        }
        return;
    }
    if (target?.widget !== "w-detail") {
        errors.push(`${path}.selection.opens must reference a detail widget when row is explicit`);
    }
    if (!detail) {
        errors.push(`${path}.selection.row is only supported on detail actions`);
    }
    if (action.endpoint || action.form || action.download || action.after) {
        errors.push(`${path}.selection.row cannot combine endpoint, form, download, or after`);
    }
    if (
        typeof selection.row !== "string" ||
        !selection.row.trim() ||
        (selection.row.startsWith("$") && !isSafeDashboardExpression(selection.row, ["resource", "selection"], true))
    ) {
        errors.push(`${path}.selection.row must be an identity or a safe resource or selection path`);
    }
}

import type { Source } from "@bernouy/cms-sources";
import type { DashboardDto, DashboardField } from "cms-dashboards/interfaces/Dashboard";
import { DASHBOARD_MAX_NESTED_FIELDS } from "cms-dashboards/interfaces/Dashboard";
import { validateRequiredId, validateRequiredPath } from "../shared";
import { validateNestedEditor } from "./nestedEditor";

type TableField = Extract<DashboardField, { type: "table" }>;
type TableColumn = TableField["columns"][number];

export function validateTableField(
    field: TableField,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    if (!Array.isArray(field.columns) || field.columns.length === 0) {
        errors.push(`${path}.columns must be a non-empty array`);
        return;
    }
    if (field.columns.length > DASHBOARD_MAX_NESTED_FIELDS) {
        errors.push(`${path}.columns must contain at most ${DASHBOARD_MAX_NESTED_FIELDS} columns`);
    }
    if (field.addLabel !== undefined) {
        if (typeof field.addLabel !== "string" || !field.addLabel.trim()) {
            errors.push(`${path}.addLabel must be a non-empty string`);
        }
        if (field.editable !== true) {
            errors.push(`${path}.addLabel requires an editable table`);
        }
    }
    const columnIds = new Set<string>();
    field.columns.slice(0, DASHBOARD_MAX_NESTED_FIELDS).forEach((column, index) => {
        const columnPath = `${path}.columns.${index}`;
        validateRequiredId(`${columnPath}.id`, column.id, errors);
        if (column.id) {
            if (columnIds.has(column.id)) {
                errors.push(`${columnPath}.id is duplicated`);
            }
            columnIds.add(column.id);
        }
        if (!column.label) {
            errors.push(`${columnPath}.label is required`);
        }
        validateRequiredPath("path", column.path, columnPath, errors);
        if (Object.hasOwn(column, "value")) {
            errors.push(`${columnPath}.value is not supported; use type`);
        }
        validateTableColumnEditing(field, column, columnPath, dashboard, source, errors);
    });
    if (field.derive) {
        if (field.derive.type !== "cartesian") {
            errors.push(`${path}.derive.type is not supported`);
        }
        if (!field.derive.sourceField) {
            errors.push(`${path}.derive.sourceField is required`);
        }
        validateRequiredPath("derive.labelPath", field.derive.labelPath, path, errors);
        validateRequiredPath("derive.valuesPath", field.derive.valuesPath, path, errors);
    }
}

function validateTableColumnEditing(
    table: TableField,
    column: TableColumn,
    path: string,
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    const hasEditingConfig =
        column.editable === true ||
        column.type !== undefined ||
        column.options !== undefined ||
        column.lookup !== undefined;
    if (hasEditingConfig && table.editable !== true) {
        errors.push(`${path} cannot configure editing unless the table is editable`);
        return;
    }
    if (column.editable !== true) {
        if (column.type !== undefined || column.options !== undefined || column.lookup !== undefined) {
            errors.push(`${path} cannot configure an editor unless the column is editable`);
        }
        return;
    }
    validateNestedEditor(column, path, ["text", "select", "combobox", "tokens"], dashboard, source, errors);
}

import type { DashboardField } from "@bernouy/cms-dashboards";
import type { DetailWidget } from "../fieldState";

export function schemaFields(widget: DetailWidget): Array<Extract<DashboardField, { type: "schema" }>> {
    return [...widget.main, ...(widget.aside ?? [])].flatMap(section => section.fields)
        .filter((field): field is Extract<DashboardField, { type: "schema" }> => field.type === "schema");
}

export function schemaKeysDependingOn(widget: DetailWidget, fieldId: string): Set<string> {
    return new Set(schemaFields(widget).filter(field => Object.values(field.schema.params ?? {}).some(expression => (
        expression === `$field.${fieldId}` || expression.startsWith(`$field.${fieldId}.`)
    ))).map(field => field.id));
}

import type { DashboardField, DashboardSection } from "@bernouy/cms-dashboards";
import { resolveExpression } from "../../../../runtime/expressions";
import type { DetailWidget } from "../fieldState";

export function schemaFields(widget: DetailWidget): Array<Extract<DashboardField, { type: "schema" }>> {
    return [...widget.main.filter(isDetailSection), ...(widget.aside ?? [])]
        .flatMap((section) => section.fields)
        .filter((field): field is Extract<DashboardField, { type: "schema" }> => field.type === "schema");
}

function isDetailSection(item: DetailWidget["main"][number]): item is DashboardSection {
    return !("widget" in item);
}

export function schemaKeysDependingOn(widget: DetailWidget, fieldId: string): Set<string> {
    return new Set(
        schemaFields(widget)
            .filter((field) =>
                Object.values(field.schema.params ?? {}).some(
                    (expression) => expression === `$field.${fieldId}` || expression.startsWith(`$field.${fieldId}.`),
                ),
            )
            .map((field) => field.id),
    );
}

export function schemaDependenciesResolved(
    field: Extract<DashboardField, { type: "schema" }>,
    resource: unknown,
    fields: Record<string, unknown>,
): boolean {
    return Object.values(field.schema.params ?? {}).every((expression) => {
        if (!expression.startsWith("$")) {
            return true;
        }
        const value = resolveExpression(expression, { resource, fields });
        return value !== undefined && value !== null && value !== "";
    });
}

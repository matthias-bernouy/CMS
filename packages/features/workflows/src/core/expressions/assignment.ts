import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { WorkflowExpression } from "workflows/interfaces/definition";
import { expressionSchema, requireAssignable } from "./schemas";
import type { ExpressionSchemas } from "./schemas";
import { workflowIssue } from "../errors";
export function requireExpression(
    expression: WorkflowExpression,
    scope: ExpressionSchemas,
    target: UlviaSchema,
    path: string,
): void {
    if (expression.kind === "literal") {
        try {
            validateSchemaValue(target, expression.value);
        } catch {
            workflowIssue(path);
        }
        return;
    }
    if (expression.kind === "object" && (target.type === "object" || target.type === "map")) {
        const entries = Object.entries(expression.fields);
        if (
            (target.minProperties !== undefined && entries.length < target.minProperties) ||
            (target.maxProperties !== undefined && entries.length > target.maxProperties)
        ) {
            workflowIssue(path);
        }
        if (target.type === "object" && target.required.some((key) => !Object.hasOwn(expression.fields, key))) {
            workflowIssue(path);
        }
        for (const [key, child] of entries) {
            if (target.type === "map" && key.length > target.maxKeyLength) {
                workflowIssue(`${path}.${key}`);
            }
            const schema = target.type === "map" ? target.values : target.properties[key];
            if (!schema) {
                workflowIssue(`${path}.${key}`);
            }
            requireExpression(child, scope, schema, `${path}.${key}`);
        }
        return;
    }
    if (expression.kind === "array" && target.type === "array") {
        if (expression.items.length < (target.minItems ?? 0) || expression.items.length > target.maxItems) {
            workflowIssue(path);
        }
        expression.items.forEach((child, index) => requireExpression(child, scope, target.items, `${path}.${index}`));
        return;
    }
    requireAssignable(expressionSchema(expression, scope), target, path);
}

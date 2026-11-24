import { firstSchemaSubsetViolation } from "@bernouy/ulvia-contracts/compatibility";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { WorkflowExpression } from "workflows/interfaces/definition";
import { schemaAt } from "../paths";
import { workflowIssue } from "../errors";
export interface ExpressionSchemas {
    readonly facts?: ReadonlySet<string>;
    readonly input: UlviaSchema;
    readonly parameter?: UlviaSchema;
    readonly trigger?: UlviaSchema;
    readonly steps: ReadonlyMap<string, UlviaSchema>;
    readonly errors: ReadonlyMap<string, UlviaSchema>;
}
export function expressionSchema(expression: WorkflowExpression, scope: ExpressionSchemas): UlviaSchema {
    switch (expression.kind) {
        case "literal":
            return literalSchema(expression.value);
        case "input":
            return schemaAt(scope.input, expression.path, scope.facts, "input");
        case "parameter": {
            if (!scope.parameter) {
                workflowIssue("parameters.unavailable");
            }
            return schemaAt(scope.parameter, expression.path, scope.facts, "parameter");
        }
        case "trigger": {
            if (!scope.trigger) {
                workflowIssue("trigger.unavailable");
            }
            return schemaAt(scope.trigger, expression.path, scope.facts, "trigger");
        }
        case "step":
        case "error": {
            const root = (expression.kind === "step" ? scope.steps : scope.errors).get(expression.stepId);
            if (!root) {
                workflowIssue(`steps.${expression.stepId}.unavailable`);
            }
            return schemaAt(root, expression.path, scope.facts, `${expression.kind}:${expression.stepId}`);
        }
        case "object": {
            const properties = Object.fromEntries(
                Object.entries(expression.fields).map(([key, value]) => [key, expressionSchema(value, scope)]),
            );
            return { type: "object", properties, required: Object.keys(properties) };
        }
        case "array": {
            const schemas = expression.items.map((item) => expressionSchema(item, scope));
            return { type: "array", items: commonSchema(schemas), minItems: schemas.length, maxItems: schemas.length };
        }
        case "exists": {
            const ref = expression.value;
            const schema =
                ref.kind === "input"
                    ? scope.input
                    : ref.kind === "parameter"
                      ? scope.parameter
                      : ref.kind === "trigger"
                        ? scope.trigger
                        : ref.kind === "step"
                          ? scope.steps.get(ref.stepId)
                          : ref.kind === "error"
                            ? scope.errors.get(ref.stepId)
                            : undefined;
            if (!schema || !("path" in ref)) {
                workflowIssue("condition.reference");
            }
            schemaAt(schema, ref.path, scope.facts, "", true);
            return { type: "boolean" };
        }
        case "compare": {
            const left = expressionSchema(expression.left, scope);
            const right = expressionSchema(expression.right, scope);
            const numeric = (schema: UlviaSchema) =>
                !("nullable" in schema && schema.nullable) && ["number", "integer"].includes(schema.type);
            if (expression.operator !== "eq" && (!numeric(left) || !numeric(right))) {
                workflowIssue("condition.numeric");
            }
            if (expression.operator === "eq" && left.type !== right.type && !(numeric(left) && numeric(right))) {
                workflowIssue("condition.types");
            }
            return { type: "boolean" };
        }
    }
}
export function requireAssignable(source: UlviaSchema, target: UlviaSchema, path: string): void {
    const violation = firstSchemaSubsetViolation(source, target, path);
    if (violation) {
        workflowIssue(violation);
    }
}
function literalSchema(value: unknown): UlviaSchema {
    if (value === null) {
        return { type: "null" };
    }
    if (typeof value === "string") {
        return { type: "string", enum: [value], minLength: value.length, maxLength: value.length };
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return { type: Number.isSafeInteger(value) ? "integer" : "number", minimum: value, maximum: value };
    }
    if (typeof value === "boolean") {
        return { type: "boolean" };
    }
    if (Array.isArray(value)) {
        return {
            type: "array",
            items: commonSchema(value.map(literalSchema)),
            minItems: value.length,
            maxItems: value.length,
        };
    }
    if (value && typeof value === "object") {
        const properties = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, literalSchema(item)]));
        return { type: "object", properties, required: Object.keys(properties) };
    }
    return workflowIssue("literal.invalid");
}
function commonSchema(schemas: readonly UlviaSchema[]): UlviaSchema {
    if (!schemas.length) {
        return { type: "null" };
    }
    const first = schemas[0]!;
    if (schemas.every((schema) => schema.type === "string") && first.type === "string") {
        const strings = schemas.filter((schema) => schema.type === "string");
        return {
            type: "string",
            maxLength: Math.max(...strings.map((schema) => schema.maxLength)),
            minLength: Math.min(...strings.map((schema) => schema.minLength ?? 0)),
            ...(strings.every((schema) => schema.enum)
                ? { enum: [...new Set(strings.flatMap((schema) => schema.enum!))] }
                : {}),
        };
    }
    for (const schema of schemas) {
        requireAssignable(schema, first, "array.items");
    }
    return first;
}
export function presentFacts(expression: WorkflowExpression, existing: ReadonlySet<string>): ReadonlySet<string> {
    if (expression.kind !== "exists") {
        return existing;
    }
    const ref = expression.value;
    if (
        ref.kind !== "input" &&
        ref.kind !== "parameter" &&
        ref.kind !== "trigger" &&
        ref.kind !== "step" &&
        ref.kind !== "error"
    ) {
        return existing;
    }
    const root = "stepId" in ref ? `${ref.kind}:${ref.stepId}` : ref.kind;
    const facts = new Set(existing);
    const parts = ref.path.split("/");
    for (let index = 1; index < parts.length; index++) {
        facts.add(`${root}:${parts.slice(0, index + 1).join("/")}`);
    }
    return facts;
}

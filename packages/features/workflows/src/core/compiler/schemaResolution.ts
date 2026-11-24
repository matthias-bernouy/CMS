import { containsResolvedSchema, SchemaResolutionError } from "@bernouy/ulvia-contracts/resolution";
import type { WorkflowCapability, WorkflowContracts, WorkflowExpression } from "workflows/interfaces/definition";
import { evaluateExpression } from "../expressions/evaluate";
import { WorkflowError, workflowIssue } from "../errors";
/** Partial evaluation never invents values for future outputs. Missing selectors fail publication. */
export function knownExpressionValue(expression: WorkflowExpression, parameters: unknown): unknown {
    if (expression.kind === "literal" || expression.kind === "parameter") {
        return evaluateExpression(expression, { input: {}, parameter: parameters, steps: {}, errors: {} });
    }
    if (expression.kind === "object") {
        return Object.fromEntries(
            Object.entries(expression.fields).flatMap(([name, child]) => {
                const value = knownExpressionValue(child, parameters);
                return value === undefined ? [] : [[name, value]];
            }),
        );
    }
    if (expression.kind === "array") {
        const values = expression.items.map((child) => knownExpressionValue(child, parameters));
        return values.every((value) => value !== undefined) ? values : undefined;
    }
    return undefined;
}
export async function materializeWorkflowCapability(
    current: WorkflowCapability,
    contracts: WorkflowContracts,
    input: unknown,
    path: string,
): Promise<WorkflowCapability> {
    const declared = current.declaredCapability ?? current.capability;
    if (!containsResolvedSchema(declared.input) && !containsResolvedSchema(declared.output)) {
        return current;
    }
    if (!contracts.resolveSchema) {
        workflowIssue(`${path}.schemaResolverUnavailable`);
    }
    try {
        const resolvedInput = await contracts.resolveSchema(current.target.contractId, declared.input, input, input);
        const resolvedOutput = await contracts.resolveSchema(current.target.contractId, declared.output, {}, input);
        return {
            ...current,
            declaredCapability: declared,
            schemaInput: input,
            capability: {
                ...declared,
                input: resolvedInput.schema as typeof declared.input,
                output: resolvedOutput.schema,
            },
            inputBindings: resolvedInput.bindings,
            outputBindings: resolvedOutput.bindings,
        };
    } catch (error) {
        if (error instanceof SchemaResolutionError && error.code === "SCHEMA_VERSION_CONFLICT") {
            throw new WorkflowError("RESOURCE_SCHEMA_CHANGED", `${path}.schema.version`);
        }
        if (error instanceof SchemaResolutionError && error.code === "INVALID_SELECTOR") {
            workflowIssue(`${path}.schemaSelectorMustBeKnown`);
        }
        throw error;
    }
}

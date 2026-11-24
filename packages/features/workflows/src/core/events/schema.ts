import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { EventDefinition } from "@bernouy/cms-events";
import type { UlviaObjectSchema } from "@bernouy/ulvia-contracts/schema";
import { SchemaResolutionError, containsResolvedSchema } from "@bernouy/ulvia-contracts/resolution";
import type { WorkflowDefinition, WorkflowContracts } from "workflows/interfaces/definition";
import { requireExpression } from "../expressions/assignment";
import { evaluateExpression } from "../expressions/evaluate";
import { WorkflowError, workflowIssue } from "../errors";
export async function resolveWorkflowEventSchema(
    definition: WorkflowDefinition,
    contracts: WorkflowContracts,
    event: EventDefinition | undefined,
    parameters: unknown,
) {
    const expression = definition.trigger?.filter;
    if (!event) {
        return undefined;
    }
    const filterSchema: UlviaObjectSchema = {
        type: "object",
        properties:
            event.schema.type === "object"
                ? Object.fromEntries(
                      (event.filterKeys ?? []).map((name) => [
                          name,
                          event.schema.type === "object" ? event.schema.properties[name]! : { type: "null" },
                      ]),
                  )
                : {},
        required: [],
    };
    let filter: unknown = {};
    if (expression) {
        requireExpression(
            expression,
            {
                input: { type: "object", properties: {}, required: [] },
                parameter: definition.parametersSchema,
                steps: new Map(),
                errors: new Map(),
            },
            filterSchema,
            "trigger.filter",
        );
        filter = evaluateExpression(expression, { input: {}, parameter: parameters, steps: {}, errors: {} }, 16384);
    }
    const filterJson = canonicalizeIJson(filter);
    if (!containsResolvedSchema(event.schema)) {
        return { filterJson, bindings: [] };
    }
    if (!contracts.resolveEventSchema) {
        workflowIssue("trigger.schemaResolverUnavailable");
    }
    const resolved = await contracts.resolveEventSchema(event, filter, true).catch((error: unknown) => {
        if (error instanceof SchemaResolutionError && error.code === "INVALID_SELECTOR") {
            workflowIssue("trigger.schemaSelectorMustBeKnown");
        }
        if (error instanceof WorkflowError && error.code === "RESOURCE_SCHEMA_CHANGED") {
            workflowIssue(error.path ?? "trigger.schema.version");
        }
        throw error;
    });
    return { filterJson, bindings: resolved.bindings };
}

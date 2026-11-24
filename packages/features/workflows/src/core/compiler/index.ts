import { resolveWorkflowEventSchema } from "../events/schema";
import { materializeWorkflowCapability, knownExpressionValue } from "./schemaResolution";
import { resolveWorkflowEvent, domainTriggerSchema } from "../events/definition";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { UlviaSchema } from "@bernouy/ulvia-contracts/schema";
import type { WorkflowPlan, WorkflowContracts, WorkflowCapability } from "workflows/interfaces/definition";
import { parseWorkflow } from "../parse";
import { workflowOrder } from "../graph";
import { expressionSchema, requireAssignable, presentFacts } from "../expressions/schemas";
import { requireExpression } from "../expressions/assignment";
import { workflowIssue } from "../errors";
type Scope = { steps: Map<string, UlviaSchema>; errors: Map<string, UlviaSchema>; facts: ReadonlySet<string> };
export async function compileWorkflow(
    json: string,
    contracts: WorkflowContracts,
    parameters: unknown = {},
): Promise<WorkflowPlan> {
    const definition = parseWorkflow(json);
    try {
        validateSchemaValue(definition.parametersSchema, parameters);
    } catch {
        workflowIssue("parameters");
    }
    if (definition.trigger) {
        try {
            validateSchemaValue(definition.inputSchema, {});
        } catch {
            workflowIssue("trigger.inputSchema");
        }
    }
    const order = workflowOrder(definition);
    const jsonOnly = (schema: UlviaSchema): boolean =>
        schema.type !== "binary" &&
        (schema.type === "object"
            ? Object.values(schema.properties).every(jsonOnly)
            : schema.type === "array"
              ? jsonOnly(schema.items)
              : schema.type === "map"
                ? jsonOnly(schema.values)
                : true);
    if (
        !jsonOnly(definition.inputSchema) ||
        !jsonOnly(definition.outputSchema) ||
        !jsonOnly(definition.parametersSchema)
    ) {
        workflowIssue("schema.binaryUnsupported");
    }
    if (definition.trigger) {
        try {
            validateSchemaValue(definition.inputSchema, {});
        } catch {
            workflowIssue("trigger.manualInputs");
        }
    }
    const capabilities: Record<string, WorkflowCapability> = Object.create(null);
    for (const step of order) {
        if (step.kind === "call") {
            capabilities[step.id] = await materializeWorkflowCapability(
                await contracts.resolve(step.target.contractId, step.target.capabilityId),
                contracts,
                knownExpressionValue(step.input, parameters),
                `steps.${step.id}`,
            );
            if (
                !jsonOnly(capabilities[step.id]!.capability.input) ||
                !jsonOnly(capabilities[step.id]!.capability.output)
            ) {
                workflowIssue(`steps.${step.id}.binaryUnsupported`);
            }
            if (capabilities[step.id]!.capability.responseEffects?.length) {
                workflowIssue(`steps.${step.id}.sessionEffect`);
            }
            if (
                capabilities[step.id]!.capability.behavior.execution === "operation" &&
                !capabilities[step.id]!.operationReadable
            ) {
                workflowIssue(`steps.${step.id}.operationUnavailable`);
            }
        }
    }
    const eventTrigger = await resolveWorkflowEvent(definition, contracts);
    const eventSchema = await resolveWorkflowEventSchema(definition, contracts, eventTrigger, parameters);
    const triggerSchema = eventTrigger ? domainTriggerSchema(eventTrigger, eventSchema?.bindings) : undefined;
    const incoming = new Map<string, Scope[]>([
        [definition.entry, [{ steps: new Map(), errors: new Map(), facts: new Set() }]],
    ]);
    const exits: Scope[] = [];
    const edge = (id: string | null, scope: Scope) => {
        if (id === null) {
            exits.push(scope);
        } else {
            incoming.set(id, [...(incoming.get(id) ?? []), scope]);
        }
    };
    for (const step of order) {
        const scope = mergeScopes(incoming.get(step.id) ?? []);
        const expressionScope = {
            ...scope,
            input: definition.inputSchema,
            parameter: definition.parametersSchema,
            ...(triggerSchema ? { trigger: triggerSchema } : {}),
        };
        if (step.kind === "condition") {
            requireAssignable(
                expressionSchema(step.test, expressionScope),
                { type: "boolean" },
                `steps.${step.id}.test`,
            );
            edge(step.then, { ...scope, facts: presentFacts(step.test, scope.facts) });
            edge(step.otherwise, scope);
        } else {
            const capability = capabilities[step.id]!.capability;
            requireExpression(step.input, expressionScope, capability.input, `steps.${step.id}.input`);
            const outputs = new Map(scope.steps);
            outputs.set(step.id, capability.output);
            edge(step.next, { ...scope, steps: outputs });
            for (const [code, target] of Object.entries(step.onError)) {
                const error = capability.errors.find((error) => error.code === code);
                if (!error) {
                    workflowIssue(`steps.${step.id}.onError.${code}`);
                }
                const errors = new Map(scope.errors);
                errors.set(step.id, {
                    type: "object",
                    properties: {
                        code: { type: "string", enum: [code], maxLength: code.length },
                        ...(error.output ? { output: error.output } : {}),
                    },
                    required: ["code", ...(error.output ? ["output"] : [])],
                });
                edge(target, { ...scope, errors });
            }
        }
    }
    const scope = mergeScopes(exits);
    requireExpression(
        definition.output,
        {
            ...scope,
            input: definition.inputSchema,
            parameter: definition.parametersSchema,
            ...(triggerSchema ? { trigger: triggerSchema } : {}),
        },
        definition.outputSchema,
        "output",
    );
    const plan = {
        format: "ulvia-workflow-plan/v1" as const,
        definition,
        capabilities,
        parameters: structuredClone(parameters),
        ...(eventTrigger ? { eventTrigger } : {}),
        ...(eventSchema ? { eventSchemas: eventSchema.bindings, eventFilterJson: eventSchema.filterJson } : {}),
        ...(triggerSchema ? { triggerSchema } : {}),
    };
    return { ...plan, digest: `sha256:${createHash("sha256").update(canonicalizeIJson(plan)).digest("hex")}` };
}
function mergeScopes(scopes: readonly Scope[]): Scope {
    if (!scopes.length) {
        workflowIssue("steps.unreachable");
    }
    const first = scopes[0]!;
    const intersect = (field: "steps" | "errors") =>
        new Map(
            [...first[field]].filter(([id, schema]) =>
                scopes.every(
                    (scope) =>
                        scope[field].has(id) && canonicalizeIJson(scope[field].get(id)) === canonicalizeIJson(schema),
                ),
            ),
        );
    return {
        steps: intersect("steps"),
        errors: intersect("errors"),
        facts: new Set([...first.facts].filter((fact) => scopes.every((scope) => scope.facts.has(fact)))),
    };
}

import { expect, test } from "bun:test";
import { compileWorkflow, inspectWorkflowPlan } from "@bernouy/workflows";
import {
    resolveSchema,
    schemaDescriptorWire,
    schemaResolverInputSchema,
    schemaDescriptorOutputSchema,
} from "@bernouy/ulvia-contracts/resolution";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import { fixture } from "../support/fixture";
const text = { type: "string", maxLength: 64 } as const;
function dynamicCall() {
    const f = fixture();
    let incompatible = false;
    const resolver: CapabilityDefinition = {
        id: "forms.describe",
        access: "admin",
        behavior: { effect: "query", execution: "sync", sensitive: true },
        bindings: [],
        input: schemaResolverInputSchema,
        output: schemaDescriptorOutputSchema,
        errors: [{ code: "SCHEMA_VERSION_CONFLICT", retryable: false }],
        schemaResolver: { selector: { type: "object", properties: { formId: text }, required: ["formId"] } },
    };
    const selected = f.capabilities["orders.read"]!;
    selected.capability = {
        ...selected.capability,
        input: {
            type: "object",
            properties: {
                formId: text,
                answers: {
                    type: "resolved",
                    resolver: resolver.id,
                    selector: { formId: { source: "value", path: "/formId" } },
                },
            },
            required: ["formId", "answers"],
        },
        output: {
            type: "object",
            properties: {
                answers: {
                    type: "resolved",
                    resolver: resolver.id,
                    selector: { formId: { source: "input", path: "/formId" } },
                },
            },
            required: ["answers"],
        },
    };
    f.services.contracts.resolveSchema = async (_contract, schema, value, input) =>
        resolveSchema(schema, value, {
            capabilities: [resolver],
            input,
            invoke: async () =>
                schemaDescriptorWire({
                    resourceId: "contact",
                    version: incompatible ? "2" : "1",
                    fields: [],
                    schema: {
                        type: "object",
                        properties: { email: incompatible ? { type: "number" } : text },
                        required: ["email"],
                    },
                }),
            seal: async () => undefined,
        });
    const definition = {
        format: "ulvia-workflow/v1",
        parametersSchema: { type: "object", properties: { formId: text }, required: ["formId"] },
        inputSchema: { type: "object", properties: { email: text }, required: ["email"] },
        outputSchema: text,
        entry: "read",
        steps: [
            {
                id: "read",
                kind: "call",
                target: { contractId: "test/orders", capabilityId: "orders.read" },
                input: {
                    kind: "object",
                    fields: {
                        formId: { kind: "parameter", path: "/formId" },
                        answers: { kind: "object", fields: { email: { kind: "input", path: "/email" } } },
                    },
                },
                next: null,
                onError: {},
            },
        ],
        output: { kind: "step", stepId: "read", path: "/answers/email" },
    };
    return {
        ...f,
        definition,
        change: () => {
            incompatible = true;
        },
    };
}
test("capability input/output schemas resolve before mappings, retain concrete witnesses and diagnose later incompatibility", async () => {
    const f = dynamicCall();
    const plan = await compileWorkflow(JSON.stringify(f.definition), f.services.contracts, { formId: "contact" });
    expect(plan.capabilities.read!.inputBindings).toHaveLength(1);
    expect(plan.capabilities.read!.outputBindings).toHaveLength(1);
    expect(await inspectWorkflowPlan(plan, f.services.contracts)).toBeUndefined();
    f.change();
    expect(await inspectWorkflowPlan(plan, f.services.contracts)).toMatchObject({ code: "CAPABILITY_SCHEMA_CHANGED" });
});
test("an unknown future selector blocks publication instead of accepting an unchecked mapping", async () => {
    const f = dynamicCall();
    const step = f.definition.steps[0]!;
    step.input.fields.formId = { kind: "input", path: "/email" };
    await expect(
        compileWorkflow(JSON.stringify(f.definition), f.services.contracts, { formId: "contact" }),
    ).rejects.toMatchObject({ code: "INVALID_DEFINITION", path: "steps.read.schemaSelectorMustBeKnown" });
});

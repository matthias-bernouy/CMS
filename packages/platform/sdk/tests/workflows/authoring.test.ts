import { expect, test } from "bun:test";
import { defineWorkflow } from "@bernouy/ulvia-sdk";
import { compileWorkflow } from "@bernouy/ulvia-sdk/build";
import { admitWorkflowManifest } from "@bernouy/ulvia-workflows";
import type { WorkflowManifest } from "@bernouy/ulvia-sdk";

const source: WorkflowManifest = {
    kind: "workflow",
    format: "ulvia-workflow-manifest/v1",
    workflowId: "example/check",
    publisherId: "example",
    name: "Check",
    version: "1.0.0",
    requirements: [],
    definition: {
        format: "ulvia-workflow/v1",
        inputSchema: { type: "object", properties: {}, required: [] },
        parametersSchema: { type: "object", properties: {}, required: [] },
        outputSchema: { type: "boolean" },
        entry: "check",
        steps: [
            { id: "check", kind: "condition", test: { kind: "literal", value: true }, then: null, otherwise: null },
        ],
        output: { kind: "literal", value: true },
    },
};
test("SDK authoring snapshots immutable data and build admission matches runtime fingerprints", () => {
    const authored = structuredClone(source);
    const definition = defineWorkflow(authored);
    Object.assign(authored, { name: "Changed" });
    expect(definition.name).toBe("Check");
    expect(Object.isFrozen(definition.definition.steps[0])).toBe(true);
    const built = compileWorkflow(definition);
    expect(admitWorkflowManifest(built.canonicalJson)).toEqual(built);
});
test("build validation rejects invalid graphs, undeclared calls and non-JSON authored data", () => {
    const cycle = structuredClone(source);
    Object.assign(cycle.definition.steps[0]!, { then: "check" });
    expect(() => compileWorkflow(defineWorkflow(cycle))).toThrow();
    const undeclared = structuredClone(source);
    Object.assign(undeclared.definition.steps[0]!, {
        kind: "call",
        target: { contractId: "example/mail", capabilityId: "send" },
        input: { kind: "literal", value: {} },
        next: null,
        onError: {},
    });
    expect(() => compileWorkflow(defineWorkflow(undeclared))).toThrow();
    expect(() => defineWorkflow({ ...source, name: undefined } as unknown as WorkflowManifest)).toThrow();
});

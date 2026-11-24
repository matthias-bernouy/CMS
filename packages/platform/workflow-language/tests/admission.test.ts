import { expect, test } from "bun:test";
import { admitWorkflowManifest, verifyStoredWorkflowManifest } from "../src/index";

const manifest = {
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
test("stored workflow identity rejects altered bytes, duplicate keys and an incorrect publisher", () => {
    const value = admitWorkflowManifest(JSON.stringify(manifest));
    expect(verifyStoredWorkflowManifest(value.canonicalJson, value.digest)).toEqual(value);
    expect(() => verifyStoredWorkflowManifest(`${value.canonicalJson}\n`, value.digest)).toThrow();
    expect(() => verifyStoredWorkflowManifest(value.canonicalJson, `sha256:${"0".repeat(64)}`)).toThrow();
    expect(() => admitWorkflowManifest(JSON.stringify({ ...manifest, publisherId: "foreign" }))).toThrow();
    expect(() => admitWorkflowManifest('{"kind":"workflow","kind":"workflow"}')).toThrow();
});

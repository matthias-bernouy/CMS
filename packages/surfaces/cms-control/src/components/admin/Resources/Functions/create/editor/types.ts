import type { FunctionCatalogSource } from "../../contracts";
import type { SchemaFieldDraft } from "../../../WorkflowEditor/schemaFields";
import type { ValueDraft } from "../../../WorkflowEditor/mapping";

export type CallDraft = {
    kind: "call";
    id: string;
    source: string;
    endpoint: string;
    params: Record<string, ValueDraft>;
    body: Record<string, ValueDraft>;
};

export type AssertDraft = {
    kind: "assert";
    operator: "equals" | "notEquals" | "exists" | "gt" | "gte" | "lt" | "lte" | "in";
    left: ValueDraft;
    right: ValueDraft;
    status: string;
    error: string;
};

export type StepDraft = CallDraft | AssertDraft;

export type StepEditorContext = {
    catalog: FunctionCatalogSource[];
    steps: StepDraft[];
    paramsFields: SchemaFieldDraft[];
    bodyFields: SchemaFieldDraft[];
    renderSteps: () => void;
    moveStep: (index: number, offset: number) => void;
};

export function newCall(catalog: FunctionCatalogSource[], index: number): CallDraft {
    const source = catalog[0];
    return {
        kind: "call",
        id: `step${index + 1}`,
        source: source?.id ?? "",
        endpoint: source?.endpoints[0]?.endpointId ?? "",
        params: {},
        body: {},
    };
}

export function newAssert(): AssertDraft {
    return {
        kind: "assert",
        operator: "equals",
        left: { mode: "reference", value: "" },
        right: { mode: "literal", value: "ready" },
        status: "403",
        error: "Condition failed",
    };
}

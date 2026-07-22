import type { CmsFunction, FunctionCondition, FunctionStep, FunctionValue } from "@bernouy/cms-functions";

import { mappedObject, resolvedDraftValue, type ValueDraft } from "../../../WorkflowEditor/mapping";
import { objectShapeFromFields, paramsFromFields } from "../../../WorkflowEditor/schemaFields";
import { parseOptional, value } from "./controls";
import { referencesBefore } from "./references";
import type { StepDraft, StepEditorContext } from "./types";

export function buildDefinition(root: ParentNode, context: StepEditorContext, returnValue: ValueDraft): CmsFunction {
    const id = value(root, "id").trim();
    const name = value(root, "name").trim();
    const description = value(root, "description").trim();
    const advancedParams = parseOptional(value(root, "params"), "Params schema");
    const advancedBody = parseOptional(value(root, "body"), "Body schema");
    const params = advancedParams ?? paramsFromFields(context.paramsFields);
    const body = advancedBody ?? objectShapeFromFields(context.bodyFields);
    const advancedOutput = parseOptional(value(root, "output"), "Output contract");
    const returnBody = returnValue.value ? resolvedDraftValue(returnValue) : undefined;
    const returnShape = referencesBefore(context, context.steps.length).find(
        (reference) => reference.value === returnValue.value,
    )?.shape;
    const returnStatus = Number(value(root, "return-status") || 200);
    const output = advancedOutput ?? (returnShape ? [{ status: String(returnStatus), body: returnShape }] : undefined);
    return {
        id,
        method: value(root, "method") as CmsFunction["method"],
        access: { mode: value(root, "access") as NonNullable<CmsFunction["access"]>["mode"] },
        meta: { name: name || id, ...(description ? { description } : {}) },
        input: {
            ...(Object.keys(params as Record<string, unknown>).length
                ? { params: params as NonNullable<CmsFunction["input"]>["params"] }
                : {}),
            ...(body !== undefined ? { body: body as NonNullable<CmsFunction["input"]>["body"] } : {}),
        },
        ...(output !== undefined ? { output: output as CmsFunction["output"] } : {}),
        steps: context.steps.map((step) => buildStep(step)),
        return: {
            status: returnStatus,
            ...(returnBody !== undefined ? { body: returnBody } : {}),
        },
    };
}

function buildStep(step: StepDraft): FunctionStep {
    if (step.kind === "call") {
        const params = mappedObject(step.params);
        const body = mappedDraft(step.body);
        return {
            id: step.id,
            call: {
                source: step.source,
                endpoint: step.endpoint,
                ...(Object.keys(params).length ? { params: params as Record<string, FunctionValue> } : {}),
                ...(body !== undefined ? { body } : {}),
            },
        };
    }
    const left = resolvedDraftValue(step.left);
    const condition =
        step.operator === "exists"
            ? { exists: left }
            : ({ [step.operator]: [left, resolvedDraftValue(step.right)] } as FunctionCondition);
    return {
        assert: {
            condition,
            failure: { status: Number(step.status || 403), error: step.error || "Condition failed" },
        },
    };
}

function mappedDraft(draft: Record<string, ValueDraft>): FunctionValue | undefined {
    const root = draft[""];
    if (root?.value) {
        return resolvedDraftValue(root);
    }
    const mapped = mappedObject(draft);
    return Object.keys(mapped).length ? mapped : undefined;
}

import type { FunctionCondition, FunctionValue } from "@bernouy/cms-functions";
import type { TriggerDefinition } from "@bernouy/cms-triggers";

import { mappedObject, resolvedDraftValue, type ValueDraft } from "../../WorkflowEditor/mapping";
import { checkbox, mappedDraft, parseOptionalObject, parseOptionalValue, select, textarea, input } from "./controls";

export function buildTriggerDefinition(
    root: ParentNode,
    conditionLeft: ValueDraft,
    conditionRight: ValueDraft,
    functionParams: Record<string, ValueDraft>,
    functionBody: Record<string, ValueDraft>,
): TriggerDefinition {
    const id = input(root, "id").value.trim();
    const label = input(root, "label").value.trim();
    const advancedParams = parseOptionalObject(textarea(root, "params").value, "Params mapping");
    const advancedBody = parseOptionalValue(textarea(root, "body").value);
    const params = advancedParams ?? mappedObject(functionParams);
    const body = advancedBody ?? mappedDraft(functionBody);
    const mode = select(root, "mode").value as NonNullable<TriggerDefinition["mode"]>;
    return {
        id,
        ...(label ? { label } : {}),
        event: {
            kind: "endpoint",
            source: select(root, "source").value,
            endpoint: select(root, "endpoint").value,
            phase: select(root, "phase").value as TriggerDefinition["event"]["phase"],
        },
        mode,
        failureMode: select(root, "failure").value as NonNullable<TriggerDefinition["failureMode"]>,
        ...(checkbox(root, "condition-enabled").checked
            ? { condition: buildCondition(root, conditionLeft, conditionRight) }
            : {}),
        function: {
            id: select(root, "function").value,
            ...(Object.keys(params).length ? { params: params as Record<string, FunctionValue> } : {}),
            ...(body !== undefined ? { body } : {}),
        },
    };
}

function buildCondition(root: ParentNode, leftDraft: ValueDraft, rightDraft: ValueDraft): FunctionCondition {
    const operator = select(root, "operator").value;
    const left = resolvedDraftValue(leftDraft);
    if (operator === "exists") {
        return { exists: left };
    }
    return { [operator]: [left, resolvedDraftValue(rightDraft)] } as FunctionCondition;
}

import { mappingEditor, targetsFromShape, type MappingTarget } from "../../../WorkflowEditor/mapping";

import { dataShapeType, field, grid, input, mappingGroup, select } from "./controls";
import { referencesBefore } from "./references";
import type { CallDraft, StepEditorContext } from "./types";

export function renderCallFields(root: HTMLElement, step: CallDraft, context: StepEditorContext): void {
    const id = input(step.id, (value) => (step.id = value));
    const source = select(
        context.catalog.map((item) => [item.id, item.label]),
        step.source,
        (value) => {
            step.source = value;
            step.endpoint = context.catalog.find((item) => item.id === value)?.endpoints[0]?.endpointId ?? "";
            step.params = {};
            step.body = {};
            context.renderSteps();
        },
    );
    const endpoints = context.catalog.find((item) => item.id === step.source)?.endpoints ?? [];
    const endpoint = select(
        endpoints.map((item) => [item.endpointId, `${item.method} ${item.meta?.name ?? item.endpointId}`]),
        step.endpoint,
        (value) => {
            step.endpoint = value;
            step.params = {};
            step.body = {};
            context.renderSteps();
        },
    );
    const contract = endpoints.find((item) => item.endpointId === step.endpoint);
    const references = referencesBefore(context, context.steps.indexOf(step));
    const paramTargets: MappingTarget[] = (contract?.params ?? []).map((param) => ({
        path: param.name,
        label: param.name,
        required: param.required,
        shape: {
            type: dataShapeType(param.type),
            ...(param.semantic ? { semantic: param.semantic } : {}),
        },
    }));
    const bodyTargets = targetsFromShape(contract?.body);
    root.append(
        grid(
            field("Step identifier", id),
            field("Source", source),
            field("Endpoint", endpoint),
            mappingGroup(
                "Parameter mapping",
                mappingEditor(paramTargets, references, step.params, "This endpoint has no request parameters."),
            ),
            mappingGroup(
                "Body mapping",
                mappingEditor(bodyTargets, references, step.body, "This endpoint has no request body."),
            ),
        ),
    );
}

import type { FunctionCatalogEndpoint, FunctionCatalogSource } from "../../contracts";
import { referencesFromShape, type ReferenceOption } from "../../../WorkflowEditor/mapping";
import { objectShapeFromFields, paramsFromFields } from "../../../WorkflowEditor/schemaFields";

import type { CallDraft, StepEditorContext } from "./types";

export function referencesBefore(context: StepEditorContext, stepIndex: number): ReferenceOption[] {
    const params = paramsFromFields(context.paramsFields);
    const body = objectShapeFromFields(context.bodyFields);
    const references: ReferenceOption[] = [
        ...Object.entries(params).flatMap(([name, shape]) =>
            referencesFromShape(shape, `$input.params.${name}`, `Input parameter / ${name}`),
        ),
        ...referencesFromShape(body, "$input.body", "Input body"),
        {
            value: "$ctx.user.id",
            label: "Current user / id",
            shape: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
        },
        { value: "$ctx.user.role", label: "Current user / role", shape: { type: "string" } },
    ];
    context.steps.slice(0, stepIndex).forEach((step) => {
        if (step.kind !== "call") {
            return;
        }
        const endpoint = endpointContract(context.catalog, step);
        const output =
            endpoint?.output?.find((entry) => /^2\d\d$/.test(entry.status))?.body ??
            endpoint?.output?.find((entry) => entry.status === "default")?.body;
        references.push(...referencesFromShape(output, `$steps.${step.id}`, `Step ${step.id}`));
    });
    return references;
}

export function endpointContract(
    catalog: FunctionCatalogSource[],
    step: CallDraft,
): FunctionCatalogEndpoint | undefined {
    return catalog
        .find((source) => source.id === step.source)
        ?.endpoints.find((endpoint) => endpoint.endpointId === step.endpoint);
}

import type { FunctionCatalogEndpoint, FunctionCatalogSource } from "../../Functions/api";
import { referencesFromShape, type ReferenceOption } from "../../WorkflowEditor/mapping";

import { dataShapeType, select, uniqueReferences } from "./controls";

export function eventReferences(root: ParentNode, sources: FunctionCatalogSource[]): ReferenceOption[] {
    const endpoint = selectedEndpoint(root, sources);
    const references: ReferenceOption[] = [
        { value: "$request.method", label: "Request / method", shape: { type: "string" } },
        { value: "$endpoint.urn", label: "Endpoint / URN", shape: { type: "string" } },
        { value: "$endpoint.source", label: "Endpoint / source", shape: { type: "string" } },
        { value: "$endpoint.endpoint", label: "Endpoint / identifier", shape: { type: "string" } },
        {
            value: "$ctx.user.id",
            label: "Current user / id",
            shape: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
        },
        { value: "$ctx.user.role", label: "Current user / role", shape: { type: "string" } },
    ];
    for (const param of endpoint?.params ?? []) {
        references.push({
            value: `$request.params.${param.name}`,
            label: `Request parameter / ${param.name}`,
            shape: {
                type: dataShapeType(param.type),
                ...(param.semantic ? { semantic: param.semantic } : {}),
            },
        });
    }
    references.push(...referencesFromShape(endpoint?.body, "$request.body", "Request body"));
    if (select(root, "phase").value === "response") {
        references.push({ value: "$response.status", label: "Response / status", shape: { type: "number" } });
        const output =
            endpoint?.output?.find((entry) => /^2\d\d$/.test(entry.status)) ??
            endpoint?.output?.find((entry) => entry.status === "default");
        references.push(...referencesFromShape(output?.body, "$response.body", "Response body"));
        references.push(...referencesFromShape(output?.triggerBody, "$response.body", "Response body / trigger-only"));
    }
    return uniqueReferences(references);
}

export function selectedEndpoint(
    root: ParentNode,
    sources: FunctionCatalogSource[],
): FunctionCatalogEndpoint | undefined {
    return sources
        .find((item) => item.id === select(root, "source").value)
        ?.endpoints.find((endpoint) => endpoint.endpointId === select(root, "endpoint").value);
}

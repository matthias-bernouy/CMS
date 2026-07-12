import type { DataField, DataFieldType } from "@bernouy/cms-content/editor";
import {
    parseUrn,
    type DataShape,
    type EndpointParam,
    type SourceEndpoint,
} from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";
import type {
    EditorSourceBodyDto,
    EditorSourceBodyFieldDto,
    EditorSourceDto,
    EditorSourceParamDto,
} from "./types";

export function editorSourceFromEndpoint(
    cms: ControlCms,
    endpoint: SourceEndpoint,
    provider: { provider: string; providerUrn?: string; providerLabel?: string },
): EditorSourceDto {
    const parsed = parseUrn(endpoint.urn);
    const path = parsed ? `${parsed.source}/${parsed.endpoint}` : endpoint.urn;
    const body = endpoint.output?.find(response => response.status === "200" && response.body)?.body
        ?? endpoint.output?.find(response => response.body)?.body;

    return {
        label: endpoint.meta?.name ?? parsed?.endpoint ?? endpoint.urn,
        url: `${cms.basePath}/.cms/sources/${path}`,
        method: endpoint.method,
        provider: provider.provider,
        ...(provider.providerUrn ? { providerUrn: provider.providerUrn } : {}),
        endpointUrn: endpoint.urn,
        providerLabel: provider.providerLabel ?? provider.provider,
        description: endpoint.meta?.description,
        params: sourceParams(endpoint.input?.params ?? []),
        body: sourceBody(endpoint.input?.body),
        fields: body ? fieldsFromShape(body) : [],
    };
}

function sourceParams(params: EndpointParam[]): EditorSourceParamDto[] | undefined {
    const mapped = params.filter(param => param.in === "query" || param.in === "path").map(param => ({
        name: param.name,
        in: param.in,
        required: param.required,
        type: param.schema.type,
        description: param.description,
    }));
    return mapped.length ? mapped : undefined;
}

function sourceBody(shape: DataShape | undefined): EditorSourceBodyDto | undefined {
    if (!shape) return undefined;
    return { contentType: "application/json", fields: bodyFieldsFromShape(shape) };
}

function bodyFieldsFromShape(shape: DataShape): EditorSourceBodyFieldDto[] {
    if (shape.type === "object") {
        const required = new Set(shape.required ?? []);
        return Object.entries(shape.properties ?? {})
            .map(([path, child]) => bodyFieldFromShape(path, child, required.has(path)));
    }
    if (shape.type === "array" && shape.items) {
        return [{ path: ".", type: "array", children: bodyFieldsFromShape(shape.items) }];
    }
    return [{ path: ".", type: fieldType(shape) }];
}

function bodyFieldFromShape(path: string, shape: DataShape, required: boolean): EditorSourceBodyFieldDto {
    const children = bodyChildren(shape);
    return {
        path,
        type: fieldType(shape),
        ...(required ? { required: true } : {}),
        ...(children.length ? { children } : {}),
    };
}

function bodyChildren(shape: DataShape): EditorSourceBodyFieldDto[] {
    if (shape.type === "array" && shape.items) return bodyFieldsFromShape(shape.items);
    if (shape.type !== "object") return [];
    const required = new Set(shape.required ?? []);
    return Object.entries(shape.properties ?? {})
        .map(([path, child]) => bodyFieldFromShape(path, child, required.has(path)));
}

function fieldsFromShape(shape: DataShape): DataField[] {
    if (shape.type === "object") {
        return Object.entries(shape.properties ?? {}).map(([path, child]) => fieldFromShape(path, child));
    }
    if (shape.type === "array" && shape.items) {
        return [{ path: ".", type: "array", children: fieldsFromShape(shape.items) }];
    }
    return [];
}

function fieldFromShape(path: string, shape: DataShape): DataField {
    return {
        path,
        type: fieldType(shape),
        children: fieldChildren(shape),
    };
}

function fieldChildren(shape: DataShape): DataField[] {
    if (shape.type === "array" && shape.items) return fieldsFromShape(shape.items);
    if (shape.type === "object") return fieldsFromShape(shape);
    return [];
}

function fieldType(shape: DataShape): DataFieldType {
    if (shape.type === "array") return "array";
    if (shape.type === "object") return "object";
    return shape.type;
}

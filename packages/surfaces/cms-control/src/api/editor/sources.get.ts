import type { DataField, DataFieldType } from "@bernouy/cms-content/editor";
import { parseUrn, type DataShape, type Endpoint, type EndpointParam, type HTTPMethod, type ParamIn } from "@bernouy/cms-gateway";
import type { ControlCms } from "cms-control/ControlCms";

export type EditorSourceParamDto = {
    name: string;
    in: ParamIn;
    required?: boolean;
    type?: string;
    description?: string;
};

export type EditorSourceBodyFieldDto = {
    path: string;
    type: DataFieldType;
    required?: boolean;
    children?: EditorSourceBodyFieldDto[];
};

export type EditorSourceBodyDto = {
    contentType: "application/json";
    fields: EditorSourceBodyFieldDto[];
};

export type EditorSourceDto = {
    label: string;
    url: string;
    method: HTTPMethod;
    provider?: string;
    providerLabel?: string;
    description?: string;
    params?: EditorSourceParamDto[];
    body?: EditorSourceBodyDto;
    fields: DataField[];
};

export default async function getEditorSources(_req: Request, cms: ControlCms): Promise<Response> {
    try {
        const providers = await cms.gateway.getAllProviders();
        const sources = providers.flatMap(provider => provider.endpoints
            .map(endpoint => sourceFromEndpoint(cms, endpoint, {
                provider: parseUrn(provider.urn)?.provider ?? provider.urn,
                providerLabel: provider.meta?.name,
            })));

        return new Response(JSON.stringify(sources), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        if (error instanceof Error && error.message === "gateway repository not configured") {
            return new Response(JSON.stringify([]), {
                headers: { "Content-Type": "application/json" },
            });
        }
        throw error;
    }
}

function sourceFromEndpoint(cms: ControlCms, endpoint: Endpoint, provider: { provider: string; providerLabel?: string }): EditorSourceDto {
    const parsed = parseUrn(endpoint.urn);
    const path = parsed ? `${parsed.provider}/${parsed.endpoint}` : endpoint.urn;
    const body = endpoint.output?.find(response => response.status === "200" && response.body)?.body
        ?? endpoint.output?.find(response => response.body)?.body;

    return {
        label:       endpoint.meta?.name ?? parsed?.endpoint ?? endpoint.urn,
        url:         `${cms.basePath}/.cms/gateway/${path}`,
        method:      endpoint.method,
        provider:    provider.provider,
        providerLabel: provider.providerLabel ?? provider.provider,
        description: endpoint.meta?.description,
        params:      sourceParams(endpoint.input?.params ?? []),
        body:        sourceBody(endpoint.input?.body),
        fields:      body ? fieldsFromShape(body) : [],
    };
}

function sourceParams(params: EndpointParam[]): EditorSourceParamDto[] | undefined {
    const mapped = params.filter(param => param.in === "query" || param.in === "path").map(param => ({
        name:        param.name,
        in:          param.in,
        required:    param.required,
        type:        param.schema.type,
        description: param.description,
    }));
    return mapped.length ? mapped : undefined;
}

function sourceBody(shape: DataShape | undefined): EditorSourceBodyDto | undefined {
    if (!shape) return undefined;
    return {
        contentType: "application/json",
        fields:      bodyFieldsFromShape(shape),
    };
}

function bodyFieldsFromShape(shape: DataShape): EditorSourceBodyFieldDto[] {
    if (shape.type === "object") {
        const required = new Set(shape.required ?? []);
        return Object.entries(shape.properties ?? {})
            .map(([path, child]) => bodyFieldFromShape(path, child, required.has(path)));
    }

    if (shape.type === "array" && shape.items) {
        return [{
            path: ".",
            type: "array",
            children: bodyFieldsFromShape(shape.items),
        }];
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
    if (shape.type === "object") return Object.entries(shape.properties ?? {}).map(([path, child]) => fieldFromShape(path, child));

    if (shape.type === "array" && shape.items) {
        return [{
            path: ".",
            type: "array",
            children: fieldsFromShape(shape.items),
        }];
    }

    return [];
}

function fieldFromShape(path: string, shape: DataShape): DataField {
    return {
        path,
        type:     fieldType(shape),
        children: fieldChildren(shape),
    };
}

function fieldChildren(shape: DataShape): DataField[] {
    if (shape.type === "array" && shape.items) return fieldsFromShape(shape.items);
    if (shape.type === "object") return fieldsFromShape(shape);
    return [];
}

function fieldType(shape: DataShape): DataFieldType {
    return shape.type === "array"
        ? "array"
        : shape.type === "object"
        ? "object"
        : shape.type;
}

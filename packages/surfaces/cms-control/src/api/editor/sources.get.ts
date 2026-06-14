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

export type EditorSourceDto = {
    label: string;
    url: string;
    method: HTTPMethod;
    provider?: string;
    providerLabel?: string;
    description?: string;
    params?: EditorSourceParamDto[];
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

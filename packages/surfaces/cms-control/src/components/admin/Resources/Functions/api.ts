import type { DataShape, EndpointResponse } from "@bernouy/cms-sources";

export type FunctionUiValue =
    | null
    | string
    | number
    | boolean
    | FunctionUiValue[]
    | { [key: string]: FunctionUiValue };

export type FunctionExecuteField =
    | {
        control: "text";
        path: string;
        label?: string;
    }
    | {
        control: "source-select";
        path: string;
        label?: string;
        source: string;
        endpoint: string;
        params?: Record<string, FunctionUiValue>;
        itemsPath?: string;
        labelPath?: string;
        valuePath?: string;
    }
    | {
        control: "json-object";
        path: string;
        label?: string;
        seed?: {
            type: "paths";
            dependsOn?: string;
            source: string;
            endpoint: string;
            params?: Record<string, FunctionUiValue>;
            pathsPath: string;
            pathNamePath?: string;
            samplePath?: string;
        };
    };

export type FunctionExecuteUi = {
    fields?: FunctionExecuteField[];
};

export type FunctionDetail = {
    id: string;
    label: string;
    description: string;
    method: string;
    access: string;
    paramsLabel: string;
    bodyLabel: string;
    inputLabel: string;
    stepsLabel: string;
    outputLabel: string;
    returnLabel: string;
    params?: Record<string, DataShape>;
    body?: DataShape;
    paramsSample: Record<string, unknown>;
    bodySample?: unknown;
    ui?: {
        execute?: FunctionExecuteUi;
    };
    steps: unknown[];
    output?: unknown[];
    return: unknown;
};

export type FunctionExecutionResult = {
    ok: boolean;
    status: number;
    body: unknown;
    contentType: string;
};

export type FunctionCatalogEndpoint = {
    endpointId: string;
    method: string;
    params: Array<{ name: string; required?: boolean; type?: string; semantic?: DataShape["semantic"] }>;
    body?: DataShape;
    output?: EndpointResponse[];
    meta?: { name?: string; description?: string };
};

export type FunctionCatalogSource = {
    id: string;
    label: string;
    endpoints: FunctionCatalogEndpoint[];
};

export function basePath(): string {
    const raw = document.querySelector('meta[name="basePath"]')?.getAttribute("content") ?? "";
    return raw.replace(/\/+$/, "");
}

export function route(path: string): string {
    return `${basePath()}${path}`;
}

export function currentFunctionId(): string {
    return new URL(window.location.href).searchParams.get("id")?.trim() ?? "";
}

export async function fetchFunctionDetail(id: string): Promise<FunctionDetail> {
    const response = await fetch(route(`/api/functions/detail?id=${encodeURIComponent(id)}`), {
        headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<FunctionDetail>;
}

export async function fetchFunctionCatalog(): Promise<FunctionCatalogSource[]> {
    const response = await fetch(route("/api/functions/catalog"), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<FunctionCatalogSource[]>;
}

export async function createFunctionDefinition(definition: unknown): Promise<FunctionDetail> {
    const response = await fetch(route("/api/functions/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<FunctionDetail>;
}

export async function executeFunctionDetail(input: {
    id: string;
    params: Record<string, unknown>;
    body?: unknown;
    includeBody: boolean;
}): Promise<FunctionExecutionResult> {
    const payload: Record<string, unknown> = { id: input.id, params: input.params };
    if (input.includeBody) payload.body = input.body;

    const response = await fetch(route("/api/functions/execute"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const contentType = response.headers.get("content-type") ?? "";
    return {
        ok: response.ok,
        status: response.status,
        body: await readResponseBody(response, contentType),
        contentType,
    };
}

export async function fetchSourceEndpoint(
    source: string,
    endpoint: string,
    params: Record<string, string> = {},
): Promise<unknown> {
    const url = new URL(route(`/.cms/sources/${encodeURIComponent(source)}/${encodeURIComponent(endpoint)}`), window.location.origin);
    for (const [key, value] of Object.entries(params)) {
        if (value !== "") url.searchParams.set(key, value);
    }
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(await response.text());
    const contentType = response.headers.get("content-type") ?? "";
    return readResponseBody(response, contentType);
}

async function readResponseBody(response: Response, contentType: string): Promise<unknown> {
    if (response.status === 204) return null;
    if (contentType.includes("application/json")) return response.json().catch(() => null);
    const text = await response.text();
    return text || null;
}

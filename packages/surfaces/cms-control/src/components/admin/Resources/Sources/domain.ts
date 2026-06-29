import type { DataShape, SourceEndpointDto } from "@bernouy/cms-sources";

export type ContractRow = {
    label: string;
    value: string;
    detail?: string;
};

export function endpointKey(endpoint: SourceEndpointDto): string {
    return endpoint.endpointId || endpoint.targetUrl;
}

export function endpointLabel(endpoint: SourceEndpointDto): string {
    return endpoint.meta?.name || endpoint.endpointId || "Endpoint";
}

export function endpointPath(endpoint: SourceEndpointDto): string {
    try {
        const url = new URL(endpoint.targetUrl);
        return `${url.pathname}${url.search}` || "/";
    } catch {
        return endpoint.targetUrl;
    }
}

export function inputRows(endpoint: SourceEndpointDto): ContractRow[] {
    const rows: ContractRow[] = endpoint.params.map(param => ({
        label: `${param.in}.${param.name}`,
        value: param.type ?? "string",
        detail: param.required ? "required" : "optional",
    }));
    if (endpoint.body) rows.push({ label: "body", value: shapeSummary(endpoint.body) });
    return rows;
}

export function outputRows(endpoint: SourceEndpointDto): ContractRow[] {
    return (endpoint.output ?? []).map(output => ({
        label: output.status,
        value: output.body ? shapeSummary(output.body) : "No body",
    }));
}

function shapeSummary(shape: DataShape): string {
    if (shape.type === "array") return `array<${shape.items ? shapeSummary(shape.items) : "unknown"}>`;
    if (shape.type !== "object") return shape.type;
    const fields = Object.keys(shape.properties ?? {});
    return fields.length ? `object { ${fields.slice(0, 6).join(", ")}${fields.length > 6 ? ", ..." : ""} }` : "object";
}

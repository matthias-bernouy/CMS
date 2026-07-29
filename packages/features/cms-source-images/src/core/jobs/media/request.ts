import type { SourceEndpoint, SourceMediaIdentityValue } from "@bernouy/cms-sources";
import type { SourceMediaAsset } from "../../../interfaces/media";

export function endpointIdentity(endpoint: SourceEndpoint): { sourceId: string; endpointId: string } | null {
    const parts = endpoint.urn.split(":");
    return parts.length === 3 && parts[0] === "urn" && parts[1] && parts[2]
        ? { sourceId: parts[1], endpointId: parts[2] }
        : null;
}

export function requestParams(
    endpoint: SourceEndpoint,
    request: Request,
): Readonly<Record<string, SourceMediaIdentityValue>> | null {
    const search = new URL(request.url).searchParams;
    const params: Record<string, SourceMediaIdentityValue> = {};
    for (const param of endpoint.input?.params ?? []) {
        if (param.source?.from === "computed") {
            return null;
        }
        const value = search.get(param.name);
        if (value === null) {
            if (param.required) {
                return null;
            }
            continue;
        }
        params[param.name] = value;
    }
    return params;
}

export function sourceRequest(scope: string, asset: SourceMediaAsset): Request {
    const base = new URL(scope);
    const prefix = base.pathname.replace(/\/$/, "");
    base.pathname = `${prefix}/.cms/sources/${encodeURIComponent(asset.sourceId)}/${encodeURIComponent(asset.endpointId)}`;
    base.search = "";
    for (const [name, value] of Object.entries(asset.params)) {
        base.searchParams.set(name, String(value));
    }
    return new Request(base, { headers: { accept: "image/*" } });
}

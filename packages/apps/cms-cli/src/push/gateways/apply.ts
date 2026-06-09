import { parseUrn, type Provider } from "@bernouy/cms-gateway";
import type { ClassifiedGateway, RemoteGatewayItem } from "./classify";

export type ApplyResult = {
    pushed: { urn: string; localHash: string }[];
    failed: { urn: string; error:     string }[];
};

const HEADERS_JSON = (token: string) => ({
    "Authorization": `Bearer ${token}`,
    "Content-Type":  "application/json",
});

export async function fetchRemoteGatewayList(adminBase: URL, token: string): Promise<RemoteGatewayItem[]> {
    const url = new URL("api/gateway-provider/list", adminBase).href;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`GET ${url} did not return an array`);
    return data as RemoteGatewayItem[];
}

/** POST every "new" provider and PUT every "update" — both as the flat indexed
 *  form-body the server's `parseProviderDto` expects (full-aggregate replace). */
export async function applyPushGateways(
    adminBase: URL,
    token:     string,
    entries:   ClassifiedGateway[],
): Promise<ApplyResult> {
    const result: ApplyResult = { pushed: [], failed: [] };
    for (const e of entries) {
        if (e.status !== "new" && e.status !== "update") continue;
        const method = e.status === "new" ? "POST" : "PUT";
        try {
            await sendProvider(adminBase, token, method, e.gateway.provider);
            result.pushed.push({ urn: e.gateway.urn, localHash: e.gateway.hash });
        } catch (err) {
            result.failed.push({ urn: e.gateway.urn, error: msg(err) });
        }
    }
    return result;
}

async function sendProvider(adminBase: URL, token: string, method: "POST" | "PUT", provider: Provider): Promise<void> {
    const url = new URL("api/gateway-provider", adminBase).href;
    const res = await fetch(url, { method, headers: HEADERS_JSON(token), body: JSON.stringify(flattenProvider(provider)) });
    if (!res.ok) throw new Error(`${method} ${url} → HTTP ${res.status}${await tail(res)}`);
}

/**
 * Serialize a Provider into the FLAT indexed form-body `parseProviderDto`
 * consumes (`endpoints.<i>.<scalar>` + per-endpoint JSON-blob strings for
 * params/body/output/meta/headers). Inverse of `parseProviderDto`, mirror of
 * `gateway-provider.get`'s flattening. `urn` is NEVER sent — the server
 * recomputes every urn from `id` + `endpointId` (its namespace invariant).
 */
export function flattenProvider(p: Provider): Record<string, string> {
    const flat: Record<string, string> = { id: parseUrn(p.urn)?.provider ?? "" };
    if (p.meta?.name)        flat["meta.name"]        = p.meta.name;
    if (p.meta?.description) flat["meta.description"] = p.meta.description;
    if (p.meta?.icon)        flat["meta.icon"]        = p.meta.icon;

    p.endpoints.forEach((e, i) => {
        flat[`endpoints.${i}.endpointId`] = parseUrn(e.urn)?.endpoint ?? "";
        flat[`endpoints.${i}.method`]     = e.method;
        flat[`endpoints.${i}.targetUrl`]  = e.targetUrl;

        const params = (e.input?.params ?? []).map(pp => ({
            name: pp.name, in: pp.in, type: pp.schema?.type ?? "string",
            required: !!pp.required, ...(pp.description ? { description: pp.description } : {}),
        }));
        if (params.length)     flat[`endpoints.${i}.params`]  = JSON.stringify(params);
        if (e.input?.body)     flat[`endpoints.${i}.body`]    = JSON.stringify(e.input.body);
        if (e.output?.length)  flat[`endpoints.${i}.output`]  = JSON.stringify(e.output);
        if (e.meta)            flat[`endpoints.${i}.meta`]    = JSON.stringify(e.meta);
        if (e.headers?.length) flat[`endpoints.${i}.headers`] = JSON.stringify(e.headers);
    });
    return flat;
}

async function tail(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    return text ? ` — ${text}` : "";
}
function msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

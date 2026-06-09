import { mkdir, writeFile } from "node:fs/promises";
import { safeJoin } from "cms-cli/push/shared/safeJoin";
import {
    parseUrn, makeEndpointUrn,
    type Provider, type Endpoint, type EndpointParam, type GatewayMeta,
    type EndpointHeader, type EndpointResponse, type HTTPMethod, type DataShape,
} from "@bernouy/cms-gateway";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullGatewaysResult = { pulled: string[]; failed: { urn: string; error: string }[] };

/** The edit-form-enriched shape returned by `GET /api/gateway-provider?urn=`. */
type EnrichedParam    = { name: string; in: string; type?: string; required?: boolean; description?: string };
type EnrichedEndpoint = {
    endpointId: string; method: string; targetUrl: string;
    params?: EnrichedParam[]; body?: unknown; output?: unknown[]; meta?: unknown; headers?: unknown[];
};
type EnrichedProvider = { urn: string; id: string; meta?: unknown; endpoints?: EnrichedEndpoint[] };

/** Materialize the remote gateway providers into `<siteDir>/gateways/<id>.json`. */
export async function pullGateways(adminBase: URL, token: string, siteDir: string): Promise<PullGatewaysResult> {
    const out: PullGatewaysResult = { pulled: [], failed: [] };
    for (const { urn } of await fetchList(adminBase, token)) {
        try {
            await writeGateway(siteDir, await fetchProvider(adminBase, token, urn));
            out.pulled.push(urn);
        } catch (err) {
            out.failed.push({ urn, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return out;
}

async function fetchList(adminBase: URL, token: string): Promise<{ urn: string }[]> {
    const url = new URL("api/gateway-provider/list", adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return await res.json() as { urn: string }[];
}

async function fetchProvider(adminBase: URL, token: string, urn: string): Promise<Provider> {
    const url = new URL(`api/gateway-provider?urn=${encodeURIComponent(urn)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return reconstructProvider(await res.json() as EnrichedProvider);
}

/**
 * Rebuild the canonical `Provider` from the enriched edit-form response — the
 * inverse of `gateway-provider.get`'s flattening: re-derive each endpoint urn
 * from `id` + `endpointId`, and re-nest each param's scalar `type` back into a
 * `schema`. body / output / meta / headers ride along verbatim.
 */
export function reconstructProvider(r: EnrichedProvider): Provider {
    return {
        urn:  r.urn,
        meta: (r.meta ?? { name: r.id }) as GatewayMeta,
        endpoints: (r.endpoints ?? []).map(e => reconstructEndpoint(r.id, e)),
    };
}

function reconstructEndpoint(providerId: string, e: EnrichedEndpoint): Endpoint {
    const params: EndpointParam[] = (e.params ?? []).map(p => ({
        name: p.name,
        in:   p.in as EndpointParam["in"],
        ...(p.required ? { required: true } : {}),
        ...(p.description ? { description: p.description } : {}),
        schema: { type: p.type ?? "string" } as DataShape,
    }));
    const body = e.body != null ? (e.body as DataShape) : undefined;
    const input = (params.length || body) ? { ...(params.length ? { params } : {}), ...(body ? { body } : {}) } : undefined;

    return {
        urn:       makeEndpointUrn(providerId, e.endpointId),
        method:    e.method as HTTPMethod,
        targetUrl: e.targetUrl,
        ...(e.headers?.length ? { headers: e.headers as EndpointHeader[] } : {}),
        ...(e.meta            ? { meta:    e.meta    as GatewayMeta }       : {}),
        ...(input             ? { input }                                   : {}),
        ...(e.output?.length  ? { output:  e.output  as EndpointResponse[] }: {}),
    };
}

async function writeGateway(siteDir: string, provider: Provider): Promise<void> {
    const id   = parseUrn(provider.urn)?.provider ?? "provider";
    const dir  = safeJoin(siteDir, "gateways");
    const file = safeJoin(dir, `${id}.json`);
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(provider, null, 2) + "\n", "utf-8");
}

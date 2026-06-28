import { mkdir, writeFile } from "node:fs/promises";
import { safeJoin } from "cms-cli/push/shared/safeJoin";
import {
    parseUrn, sourceDtoToSource,
    type Source, type SourceDto,
} from "@bernouy/cms-sources";

const HEADERS = (token: string) => ({ "Authorization": `Bearer ${token}` });

export type PullGatewaysResult = { pulled: string[]; failed: { urn: string; error: string }[] };

/** The edit-form-enriched shape returned by `GET /api/gateway-provider?urn=`. */
type EnrichedEndpoint = Omit<SourceDto["endpoints"][number], "params"> & {
    params?: SourceDto["endpoints"][number]["params"];
};
type EnrichedProvider = {
    urn: string;
    id: string;
    meta?: SourceDto["meta"];
    endpoints?: EnrichedEndpoint[];
};

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

async function fetchProvider(adminBase: URL, token: string, urn: string): Promise<Source> {
    const url = new URL(`api/gateway-provider?urn=${encodeURIComponent(urn)}`, adminBase).href;
    const res = await fetch(url, { headers: HEADERS(token) });
    if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
    return reconstructProvider(await res.json() as EnrichedProvider);
}

/**
 * Rebuild the canonical `Source` from the enriched edit-form response — the
 * inverse of `gateway-provider.get`'s flattening: re-derive each endpoint urn
 * from `id` + `endpointId`, and re-nest each param's scalar `type` back into a
 * `schema`. body / output / meta / headers ride along verbatim.
 */
export function reconstructProvider(r: EnrichedProvider): Source {
    return sourceDtoToSource({
        id: r.id,
        meta: r.meta ?? { name: r.id },
        endpoints: (r.endpoints ?? []).map(e => ({
            endpointId: e.endpointId,
            method: e.method,
            targetUrl: e.targetUrl,
            params: (e.params ?? []).map(p => ({
                name: p.name,
                in: p.in,
                ...(p.type ? { type: p.type } : {}),
                ...(p.required ? { required: true } : {}),
                ...(p.description ? { description: p.description } : {}),
            })),
            ...(e.body !== undefined ? { body: e.body } : {}),
            ...(e.output !== undefined ? { output: e.output } : {}),
            ...(e.meta !== undefined ? { meta: e.meta } : {}),
            ...(e.headers !== undefined ? { headers: e.headers } : {}),
        })),
    });
}

async function writeGateway(siteDir: string, provider: Source): Promise<void> {
    const id   = parseUrn(provider.urn)?.source ?? "provider";
    const dir  = safeJoin(siteDir, "gateways");
    const file = safeJoin(dir, `${id}.json`);
    await mkdir(dir, { recursive: true });
    await writeFile(file, JSON.stringify(provider, null, 2) + "\n", "utf-8");
}

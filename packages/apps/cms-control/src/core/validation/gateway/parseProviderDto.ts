import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { HTTP_METHODS, type HTTPMethod, type GatewayMeta } from "@bernouy/cms-gateway";

/** V1 param value types (scalars). Full recursive DataShape is reserved for the body. */
const PARAM_TYPES = ["string", "number", "boolean"] as const;
type ParamType = typeof PARAM_TYPES[number];
/** Where a param goes upstream (see `buildUpstreamUrl`). */
const PARAM_INS = ["path", "query", "header"] as const;
type ParamIn = typeof PARAM_INS[number];

export type EndpointParamDto = {
    name: string;
    in: ParamIn;
    type: ParamType;
    required: boolean;
};

export type EndpointDto = {
    endpointId: string;
    method: HTTPMethod;
    targetUrl: string;
    params: EndpointParamDto[];
};

export type ProviderDto = {
    id: string;
    meta: GatewayMeta;
    endpoints: EndpointDto[];
};

/** Matches the flat indexed endpoint keys a `<cms-form>` posts, e.g. `endpoints.0.targetUrl`. */
const ENDPOINT_KEY = /^endpoints\.(\d+)\.(endpointId|method|targetUrl)$/;
/** Matches the flat doubly-indexed param keys, e.g. `endpoints.0.params.1.name`. */
const PARAM_KEY = /^endpoints\.(\d+)\.params\.(\d+)\.(name|in|type|required)$/;
type ParamFields = Partial<Record<"name" | "in" | "type" | "required", string>>;

/** Same slug shape as the identity-provider create flow (lowercase kebab). */
const slugify = (s: string): string =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Validates a FLAT body (as emitted by `<cms-form>`'s `Object.fromEntries(FormData)`)
 * against the gateway-provider contract and produces a typed DTO. Provider meta is
 * read from flat dotted keys (`meta.name`, …); endpoints are reconstructed from an
 * indexed flat array (`endpoints.<i>.<field>`) — sparse indices are compacted so a
 * removed row (a gap left by the UI) doesn't break submission.
 *
 * The parser NEVER reads `urn` from the body: provider/endpoint urns are recomputed
 * in the create/update service from `id` + `endpointId` (security invariant — a body
 * cannot point an endpoint into another provider's namespace).
 */
export function parseProviderDto(body: Record<string, unknown>): ProviderDto {
    // ── Provider-level fields ──
    if (typeof body.id !== "string" || !body.id) throw new MissingParam("id");
    const id = slugify(body.id);
    if (!id) throw new InvalidParam("id", "cannot derive an id");

    // ── Group flat indexed endpoint keys by row index ──
    const rows = new Map<number, Partial<Record<"endpointId" | "method" | "targetUrl", string>>>();
    // ── Group params by endpoint index, then param index ──
    const paramRows = new Map<number, Map<number, ParamFields>>();
    for (const [key, value] of Object.entries(body)) {
        const pm = PARAM_KEY.exec(key);
        if (pm) {
            if (typeof value !== "string") throw new InvalidParam(key, "expected a string.");
            const ei = Number(pm[1]), pi = Number(pm[2]);
            const epParams = paramRows.get(ei) ?? new Map<number, ParamFields>();
            const prow = epParams.get(pi) ?? {};
            prow[pm[3] as keyof ParamFields] = value;
            epParams.set(pi, prow);
            paramRows.set(ei, epParams);
            continue;
        }
        const m = ENDPOINT_KEY.exec(key);
        if (!m) continue;
        if (typeof value !== "string") throw new InvalidParam(key, "expected a string.");
        const idx = Number(m[1]);
        const field = m[2] as "endpointId" | "method" | "targetUrl";
        const row = rows.get(idx) ?? {};
        row[field] = value;
        rows.set(idx, row);
    }

    /** Reconstruct one endpoint's params, compacting sparse indices and dropping
     *  unfilled (name-less) rows. */
    const buildParams = (ei: number): EndpointParamDto[] => {
        const epParams = paramRows.get(ei);
        if (!epParams) return [];
        const out: EndpointParamDto[] = [];
        const seen = new Set<string>();
        for (const pi of [...epParams.keys()].sort((a, b) => a - b)) {
            const p = epParams.get(pi)!;
            const name = (p.name ?? "").trim();
            if (!name) continue;   // unfilled row → skip
            if (seen.has(name)) {
                throw new InvalidParam(`endpoints.${ei}.params.${pi}.name`, "duplicate param name");
            }
            seen.add(name);
            const pin = p.in ?? "query";
            if (!(PARAM_INS as readonly string[]).includes(pin)) {
                throw new InvalidParam(`endpoints.${ei}.params.${pi}.in`, "must be path|query|header");
            }
            const type = p.type ?? "string";
            if (!(PARAM_TYPES as readonly string[]).includes(type)) {
                throw new InvalidParam(`endpoints.${ei}.params.${pi}.type`, "must be string|number|boolean");
            }
            out.push({ name, in: pin as ParamIn, type: type as ParamType, required: p.required === "true" });
        }
        return out;
    };

    // ── Compact sparse indices ascending; validate each surviving row ──
    const endpoints: EndpointDto[] = [];
    const seenIds = new Set<string>();
    for (const idx of [...rows.keys()].sort((a, b) => a - b)) {
        const row = rows.get(idx)!;
        const endpointId = required(row.endpointId, `endpoints.${idx}.endpointId`);
        const method     = required(row.method,     `endpoints.${idx}.method`);
        const targetUrl  = required(row.targetUrl,  `endpoints.${idx}.targetUrl`);

        if (!(HTTP_METHODS as readonly string[]).includes(method)) {
            throw new InvalidParam(`endpoints.${idx}.method`, `must be ${HTTP_METHODS.join("|")}`);
        }
        if (!isParsableUrl(targetUrl)) {
            throw new InvalidParam(`endpoints.${idx}.targetUrl`, "invalid URL");
        }
        if (seenIds.has(endpointId)) {
            throw new InvalidParam(`endpoints.${idx}.endpointId`, "duplicate within provider");
        }
        seenIds.add(endpointId);

        endpoints.push({ endpointId, method: method as HTTPMethod, targetUrl, params: buildParams(idx) });
    }

    // Zero endpoints is allowed: the create form makes a provider shell, and
    // endpoints are added afterwards on the provider's edit page.
    return { id, meta: buildMeta(body, id), endpoints };
}

function required(value: string | undefined, name: string): string {
    if (!value) throw new MissingParam(name);
    return value;
}

/** `meta.name` defaults to the id so a listing never shows the bare urn. */
function buildMeta(body: Record<string, unknown>, id: string): GatewayMeta {
    const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
    const meta: GatewayMeta = { name: str(body["meta.name"]) ?? id };
    const description = str(body["meta.description"]);
    const icon        = str(body["meta.icon"]);
    if (description) meta.description = description;
    if (icon)        meta.icon = icon;
    return meta;
}

function isParsableUrl(value: string): boolean {
    try { new URL(value); return true; } catch { return false; }
}

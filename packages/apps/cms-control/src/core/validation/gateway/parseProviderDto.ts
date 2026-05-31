import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { HTTP_METHODS, type HTTPMethod, type GatewayMeta, type DataShape } from "@bernouy/cms-gateway";
import { parseShapeField } from "./parseDataShape";

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
    /** Round-tripped verbatim (not editable yet) so editing never wipes a stored
     *  param description — e.g. the BAN preset sets one on every param. */
    description?: string;
};

export type EndpointDto = {
    endpointId: string;
    method: HTTPMethod;
    targetUrl: string;
    params: EndpointParamDto[];
    /** Request-body shape (recursive). Authored as a JSON blob in the In tab. */
    body?: DataShape;
    /** Response shape — round-tripped (no editor yet) so an edit never wipes a
     *  stored output (B1). Re-validated + normalised by `parseDataShape` (unknown
     *  DataShape vocabulary would be dropped), not byte-for-byte verbatim. */
    output?: DataShape;
    /** Endpoint meta (name/description/icon) — no editor yet, round-tripped (and
     *  re-validated) so an edit never wipes it (e.g. the BAN preset names every endpoint). */
    meta?: GatewayMeta;
};

export type ProviderDto = {
    id: string;
    meta: GatewayMeta;
    endpoints: EndpointDto[];
};

/** Matches the flat indexed endpoint keys a `<cms-form>` posts, e.g. `endpoints.0.targetUrl`. */
const ENDPOINT_KEY = /^endpoints\.(\d+)\.(endpointId|method|targetUrl)$/;
/** Matches the flat doubly-indexed param keys, e.g. `endpoints.0.params.1.name`. */
const PARAM_KEY = /^endpoints\.(\d+)\.params\.(\d+)\.(name|in|type|required|description)$/;
/** Matches the per-endpoint JSON blobs (a JSON string), e.g. `endpoints.0.body`. */
const BLOB_KEY = /^endpoints\.(\d+)\.(body|output|meta)$/;
type ParamFields = Partial<Record<"name" | "in" | "type" | "required" | "description", string>>;
type BlobFields = Partial<Record<"body" | "output" | "meta", unknown>>;

/** `{name}` placeholders in a target URL are the endpoint's path params. They are
 *  DERIVED here (not posted by the form): the URL is the single source of truth,
 *  so the editor only displays them read-only. Each becomes a required `in:'path'`
 *  param — the proxy templates `{name}` from the caller's request, and an
 *  undeclared placeholder would 500 at execution. Deduped, kept in URL order. */
const PATH_PLACEHOLDER = /\{(\w+)\}/g;
function pathParamsFromUrl(targetUrl: string): EndpointParamDto[] {
    const out: EndpointParamDto[] = [];
    const seen = new Set<string>();
    for (const m of targetUrl.matchAll(PATH_PLACEHOLDER)) {
        const name = m[1]!;
        if (seen.has(name)) continue;
        seen.add(name);
        out.push({ name, in: "path", type: "string", required: true });
    }
    return out;
}

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
    // ── Per-endpoint body/output/meta JSON blobs (round-tripped + re-validated) ──
    const blobRows = new Map<number, BlobFields>();
    for (const [key, value] of Object.entries(body)) {
        const sm = BLOB_KEY.exec(key);
        if (sm) {
            const ei = Number(sm[1]);
            const srow = blobRows.get(ei) ?? {};
            srow[sm[2] as keyof BlobFields] = value;
            blobRows.set(ei, srow);
            continue;
        }
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

    /** Reconstruct one endpoint's query params, compacting sparse indices and
     *  dropping unfilled (name-less) rows. `reserved` holds the path-param names
     *  already taken by the URL, so a query param can't shadow a path placeholder. */
    const buildParams = (ei: number, reserved: ReadonlySet<string>): EndpointParamDto[] => {
        const epParams = paramRows.get(ei);
        if (!epParams) return [];
        const out: EndpointParamDto[] = [];
        const seen = new Set<string>(reserved);
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
            const description = (p.description ?? "").trim();
            out.push({
                name, in: pin as ParamIn, type: type as ParamType, required: p.required === "true",
                ...(description ? { description } : {}),
            });
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

        // Path params are derived from the URL; query params come from the form.
        // The path names are reserved first so a query row can't reuse one.
        const pathParams = pathParamsFromUrl(targetUrl);
        const queryParams = buildParams(idx, new Set(pathParams.map(p => p.name)));
        // Body is authored in the editor; output + meta are round-tripped + re-validated (B1 fix).
        const blobs = blobRows.get(idx);
        const body = parseShapeField(blobs?.body, `endpoints.${idx}.body`);
        const output = parseShapeField(blobs?.output, `endpoints.${idx}.output`);
        const meta = parseMetaField(blobs?.meta, `endpoints.${idx}.meta`);
        endpoints.push({
            endpointId, method: method as HTTPMethod, targetUrl,
            params: [...pathParams, ...queryParams],
            ...(body ? { body } : {}),
            ...(output ? { output } : {}),
            ...(meta ? { meta } : {}),
        });
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

/** Parse a per-endpoint `meta` JSON blob into a validated `GatewayMeta`, or
 *  `undefined` when blank/un-named. This is an editor-less round-trip field, so a
 *  malformed stored meta is DROPPED (return undefined) rather than thrown — a
 *  name-less meta must not make the provider un-saveable through a UI that can't fix it. */
function parseMetaField(raw: unknown, path: string): GatewayMeta | undefined {
    if (raw == null || raw === "") return undefined;
    if (typeof raw !== "string") return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return undefined; }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const m = parsed as Record<string, unknown>;
    const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
    const name = str(m.name);
    if (!name) return undefined;   // no valid name → drop the meta (GatewayMeta requires one)
    const meta: GatewayMeta = { name };
    const description = str(m.description);
    const icon = str(m.icon);
    if (description) meta.description = description;
    if (icon) meta.icon = icon;
    return meta;
}

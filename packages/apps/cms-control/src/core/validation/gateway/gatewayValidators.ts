import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { GatewayMeta, EndpointResponse, DataShape } from "@bernouy/cms-gateway";
import { parseDataShape } from "./parseDataShape";

/** V1 param value types (scalars); the full recursive DataShape is reserved for the body. */
export const PARAM_TYPES = ["string", "number", "boolean"] as const;
export type ParamType = typeof PARAM_TYPES[number];
/** Where a param goes upstream (see `buildUpstreamUrl`). */
export const PARAM_INS = ["path", "query", "header"] as const;
export type ParamIn = typeof PARAM_INS[number];
export type EndpointParamDto = {
    name: string;
    in: ParamIn;
    type: ParamType;
    required: boolean;
    description?: string;   // round-tripped verbatim (not editable yet) — never wiped on edit
};
/** `{name}` placeholders in a URL are DERIVED required `in:'path'` params, deduped in URL order. */
const PATH_PLACEHOLDER = /\{(\w+)\}/g;
export function pathParamsFromUrl(targetUrl: string): EndpointParamDto[] {
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
export const slugify = (s: string): string =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export function isParsableUrl(value: string): boolean {
    try { new URL(value); return true; } catch { return false; }
}
/** Read a truthy string field, else `undefined`. Shared by `buildMeta`/`parseMetaField`. */
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
/** Provider `meta`; `meta.name` defaults to the id so a listing never shows the bare urn. */
export function buildMeta(body: Record<string, unknown>, id: string): GatewayMeta {
    const meta: GatewayMeta = { name: str(body["meta.name"]) ?? id };
    const description = str(body["meta.description"]);
    const icon        = str(body["meta.icon"]);
    if (description) meta.description = description;
    if (icon)        meta.icon = icon;
    return meta;
}
/** Parse a per-endpoint `params` JSON blob into validated DTOs. `reserved` holds
 *  URL-derived path names so a posted param can't shadow one; empty-named skipped, `in:'path'` rejected. */
export function parseParamsBlob(raw: unknown, reserved: ReadonlySet<string>, path: string): EndpointParamDto[] {
    if (raw == null || raw === "") return [];
    if (typeof raw !== "string") throw new InvalidParam(path, "expected a JSON string");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new InvalidParam(path, "invalid JSON"); }
    if (!Array.isArray(parsed)) throw new InvalidParam(path, "expected an array");
    const out: EndpointParamDto[] = [];
    const seen = new Set<string>(reserved);
    parsed.forEach((el, i) => {
        if (typeof el !== "object" || el === null) throw new InvalidParam(`${path}.${i}`, "expected an object");
        const p = el as Record<string, unknown>;
        const name = (typeof p.name === "string" ? p.name : "").trim();
        if (!name) return;   // unfilled row → skip
        if (seen.has(name)) throw new InvalidParam(`${path}.${i}.name`, "duplicate param name");
        seen.add(name);
        const pin = typeof p.in === "string" ? p.in : "query";
        if (pin === "path" || !(PARAM_INS as readonly string[]).includes(pin)) throw new InvalidParam(`${path}.${i}.in`, "must be query|header");
        const type = typeof p.type === "string" ? p.type : "string";
        if (!(PARAM_TYPES as readonly string[]).includes(type)) throw new InvalidParam(`${path}.${i}.type`, "must be string|number|boolean");
        const description = (typeof p.description === "string" ? p.description : "").trim();
        out.push({
            name, in: pin as ParamIn, type: type as ParamType,
            required: p.required === true || p.required === "true",
            ...(description ? { description } : {}),
        });
    });
    return out;
}
/** Parse a per-endpoint `meta` JSON blob into a `GatewayMeta`, or `undefined` when
 *  blank/un-named. Editor-less round-trip field: a malformed stored meta is DROPPED (not
 *  thrown) so it can't make the provider un-saveable. */
export function parseMetaField(raw: unknown): GatewayMeta | undefined {
    if (raw == null || raw === "" || typeof raw !== "string") return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return undefined; }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const m = parsed as Record<string, unknown>;
    const name = str(m.name);
    if (!name) return undefined;   // GatewayMeta requires a name → drop
    const meta: GatewayMeta = { name };
    const description = str(m.description);
    const icon = str(m.icon);
    if (description) meta.description = description;
    if (icon) meta.icon = icon;
    return meta;
}
/** An HTTP status code "100".."599", or the OpenAPI fallback literal "default". */
const STATUS_CODE = /^[1-5][0-9][0-9]$/;
/** Parse a per-endpoint `output` JSON blob into a per-status `EndpointResponse[]`, or
 *  `undefined` when nothing valid remains. LENIENT like `parseMetaField` (never throws):
 *  bad entries dropped, status must be a code or "default", duplicates keep the FIRST; a
 *  body failing `parseDataShape` (proto/depth/node-count defenses) is dropped, status kept. */
export function parseResponsesBlob(raw: string | undefined, path: string): EndpointResponse[] | undefined {
    if (raw == null || raw === "") return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return undefined; }
    if (!Array.isArray(parsed)) return undefined;
    const out: EndpointResponse[] = [];
    const seen = new Set<string>();
    parsed.forEach((el, i) => {
        if (typeof el !== "object" || el === null || Array.isArray(el)) return;
        const e = el as Record<string, unknown>;
        const status = typeof e.status === "string" ? e.status : "";
        if ((status !== "default" && !STATUS_CODE.test(status)) || seen.has(status)) return;
        seen.add(status);   // dedupe: keep first
        let body: DataShape | undefined;
        if (e.body != null) try { body = parseDataShape(e.body, `${path}[${i}].body`); } catch { /* bad body dropped */ }
        out.push(body ? { status, body } : { status });
    });
    return out.length ? out : undefined;
}

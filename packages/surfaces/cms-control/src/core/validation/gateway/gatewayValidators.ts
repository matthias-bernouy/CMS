import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { ComputedParamRef, SourceMeta, ParamIn, ParamValueSource, SourceParamDto } from "@bernouy/cms-sources";
import { COMPUTED_PARAM_REFS, PARAM_INS, extractPathParamNames } from "@bernouy/cms-sources";

/** V1 param value types (scalars) — an EDITOR restriction; the gateway model
 *  allows any `DataShape`, the full recursive shape is reserved for the body. */
export const PARAM_TYPES = ["string", "number", "boolean"] as const;
export type ParamType = typeof PARAM_TYPES[number];
export type EndpointParamDto = Omit<SourceParamDto, "type" | "required"> & {
    type: ParamType;
    required: boolean;
    source?: ParamValueSource;
};
/** `{name}` placeholders in a URL are DERIVED required `in:'path'` params, deduped in URL order. */
export function pathParamsFromUrl(targetUrl: string): EndpointParamDto[] {
    return extractPathParamNames(targetUrl).map(name => ({ name, in: "path" as const, type: "string" as const, required: true }));
}
/** Read a truthy string field, else `undefined`. Shared by `buildMeta`/`parseMetaField`/`blobParsers`. */
export const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
/** Source `meta`; `meta.name` defaults to the id so a listing never shows the bare urn. */
export function buildMeta(body: Record<string, unknown>, id: string): SourceMeta {
    const meta: SourceMeta = { name: str(body["meta.name"]) ?? id };
    const description = str(body["meta.description"]);
    const icon        = str(body["meta.icon"]);
    const svg         = str(body["meta.svg"]);
    if (description) meta.description = description;
    if (icon)        meta.icon = icon;
    if (svg)         meta.svg = svg;
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
        const source = parseParamSource(p.source, `${path}.${i}.source`);
        if (source.from === "computed" && pin === "path") {
            throw new InvalidParam(`${path}.${i}.source`, "computed values cannot be used for path params.");
        }
        out.push({
            name, in: pin as ParamIn, type: type as ParamType,
            required: p.required === true || p.required === "true",
            ...(description ? { description } : {}),
            ...(source.from === "computed" ? { source } : {}),
        });
    });
    return out;
}

function parseParamSource(raw: unknown, path: string): ParamValueSource {
    if (raw === undefined || raw === null) return { from: "request" };
    if (typeof raw !== "object" || Array.isArray(raw)) throw new InvalidParam(path, "expected an object.");
    const source = raw as Record<string, unknown>;
    if (source.from === "request") return { from: "request" };
    if (source.from !== "computed") throw new InvalidParam(`${path}.from`, "must be request|computed.");
    if (!(COMPUTED_PARAM_REFS as readonly unknown[]).includes(source.ref)) {
        throw new InvalidParam(`${path}.ref`, "must be userID.");
    }
    return { from: "computed", ref: source.ref as ComputedParamRef };
}
/** Parse a per-endpoint `meta` JSON blob into a `SourceMeta`, or `undefined` when
 *  blank/un-named. Editor-less round-trip field: a malformed stored meta is DROPPED (not
 *  thrown) so it can't make the provider un-saveable. */
export function parseMetaField(raw: unknown): SourceMeta | undefined {
    if (raw == null || raw === "" || typeof raw !== "string") return undefined;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return undefined; }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    const m = parsed as Record<string, unknown>;
    const name = str(m.name);
    if (!name) return undefined;   // SourceMeta requires a name → drop
    const meta: SourceMeta = { name };
    const description = str(m.description);
    const icon = str(m.icon);
    const svg = str(m.svg);
    if (description) meta.description = description;
    if (icon) meta.icon = icon;
    if (svg) meta.svg = svg;
    return meta;
}

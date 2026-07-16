import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { HTTP_METHODS, MAX_SOURCE_ENDPOINT_TIMEOUT_MS, RESPONSE_KINDS, isAllowedSourceTargetUrl, isSourceEndpointAccessMode, isSystemSourceId, SYSTEM_SOURCE_ID_PREFIX, type HTTPMethod, type ResponseKind, type SourceDto, type SourceEndpointAccess, type SourceEndpointEffects } from "@bernouy/cms-sources";
import { slugify } from "cms-control/core/validation/slugify";
import { parseShapeField } from "./parseShapeField";
import { pathParamsFromUrl, parseParamsBlob, parseMetaField, buildMeta } from "./gatewayValidators";
import { parseResponsesBlob, parseHeadersBlob } from "./blobParsers";
export type { SourceDto };

/** Matches the flat indexed endpoint scalar keys, e.g. `endpoints.0.targetUrl`. */
const ENDPOINT_KEY = /^endpoints\.(\d+)\.(endpointId|method|targetUrl|timeoutMs|responseKind|mediaType)$/;
/** Matches the per-endpoint JSON blobs, e.g. `endpoints.0.params`. Every structured field
 *  (params/body/output/meta/headers/effects) is posted as one JSON blob — the parser validates it. */
const BLOB_KEY = /^endpoints\.(\d+)\.(params|body|output|meta|headers|access|effects)$/;
type BlobFields = Partial<Record<"params" | "body" | "output" | "meta" | "headers" | "access" | "effects", unknown>>;

/**
 * Validates a FLAT body (as emitted by a native form's `Object.fromEntries(FormData)`)
 * against the source contract and produces a typed DTO. Source meta is
 * read from flat dotted keys (`meta.name`, …); endpoints are reconstructed from an
 * indexed flat array (`endpoints.<i>.<field>`) — sparse indices are compacted so a
 * removed row (a gap left by the UI) doesn't break submission. The parser NEVER reads
 * `urn` from the body: urns are recomputed in the service from `id` + `endpointId`
 * (security invariant — a body cannot point an endpoint into another provider's namespace).
 */
export function parseSourceDto(body: Record<string, unknown>): SourceDto {
    if (typeof body.id !== "string" || !body.id) throw new MissingParam("id");
    const id = slugify(body.id);
    if (!id) throw new InvalidParam("id", "cannot derive an id");
    if (isSystemSourceId(id)) throw new InvalidParam("id", `reserved prefix "${SYSTEM_SOURCE_ID_PREFIX}"`);

    // Group flat scalar keys by row index; collect per-endpoint JSON blobs separately.
    const rows = new Map<number, Partial<Record<"endpointId" | "method" | "targetUrl" | "timeoutMs" | "responseKind" | "mediaType", string>>>();
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
        const m = ENDPOINT_KEY.exec(key);
        if (!m) continue;
        if (typeof value !== "string") throw new InvalidParam(key, "expected a string.");
        const idx = Number(m[1]);
        const field = m[2] as "endpointId" | "method" | "targetUrl" | "timeoutMs" | "responseKind" | "mediaType";
        const row = rows.get(idx) ?? {};
        row[field] = value;
        rows.set(idx, row);
    }

    // Compact sparse endpoint indices ascending; validate each surviving row.
    const endpoints: SourceDto["endpoints"] = [];
    const seenIds = new Set<string>();
    for (const idx of [...rows.keys()].sort((a, b) => a - b)) {
        const row = rows.get(idx)!;
        const endpointId = required(row.endpointId, `endpoints.${idx}.endpointId`);
        const method     = required(row.method,     `endpoints.${idx}.method`);
        const targetUrl  = required(row.targetUrl,  `endpoints.${idx}.targetUrl`);

        if (!(HTTP_METHODS as readonly string[]).includes(method)) {
            throw new InvalidParam(`endpoints.${idx}.method`, `must be ${HTTP_METHODS.join("|")}`);
        }
        if (!isAllowedSourceTargetUrl(targetUrl)) {
            throw new InvalidParam(`endpoints.${idx}.targetUrl`, "invalid or blocked URL");
        }
        if (row.responseKind && !(RESPONSE_KINDS as readonly string[]).includes(row.responseKind)) {
            throw new InvalidParam(`endpoints.${idx}.responseKind`, `must be ${RESPONSE_KINDS.join("|")}`);
        }
        const timeoutMs = parseTimeoutMs(row.timeoutMs, `endpoints.${idx}.timeoutMs`);
        const mediaType = row.mediaType?.trim();
        if (seenIds.has(endpointId)) {
            throw new InvalidParam(`endpoints.${idx}.endpointId`, "duplicate within provider");
        }
        seenIds.add(endpointId);

        // Path params derived from the URL (reserved so a posted param can't shadow
        // one); body authored in the editor; output/meta/headers round-tripped (B1).
        const blobs = blobRows.get(idx);
        const pathParams = pathParamsFromUrl(targetUrl);
        const queryParams = parseParamsBlob(blobs?.params, new Set(pathParams.map(p => p.name)), `endpoints.${idx}.params`);
        const body = parseShapeField(blobs?.body, `endpoints.${idx}.body`);
        const output = parseResponsesBlob(typeof blobs?.output === "string" ? blobs.output : undefined, `endpoints.${idx}.output`);
        const meta = parseMetaField(blobs?.meta);
        const headers = parseHeadersBlob(blobs?.headers, `endpoints.${idx}.headers`);
        const access = parseAccessBlob(blobs?.access, `endpoints.${idx}.access`);
        const effects = parseEffectsBlob(blobs?.effects, `endpoints.${idx}.effects`);
        endpoints.push({
            endpointId, method: method as HTTPMethod, targetUrl,
            ...(timeoutMs !== undefined ? { timeoutMs } : {}),
            ...(access ? { access } : {}),
            ...(row.responseKind ? { responseKind: row.responseKind as ResponseKind } : {}),
            ...(mediaType ? { mediaType } : {}),
            params: [...pathParams, ...queryParams],
            ...(body ? { body } : {}),
            ...(output ? { output } : {}),
            ...(meta ? { meta } : {}),
            ...(headers ? { headers } : {}),
            ...(effects ? { effects } : {}),
        });
    }

    // Zero endpoints is allowed: the create form makes a provider shell, and
    // endpoints are added afterwards on the provider's edit page.
    return { id, meta: buildMeta(body, id), endpoints };
}

function parseTimeoutMs(raw: string | undefined, name: string): number | undefined {
    if (raw === undefined || raw === "") return undefined;
    if (!/^\d+$/.test(raw)) {
        throw new InvalidParam(name, `must be an integer between 1 and ${MAX_SOURCE_ENDPOINT_TIMEOUT_MS}`);
    }
    const timeoutMs = Number(raw);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_SOURCE_ENDPOINT_TIMEOUT_MS) {
        throw new InvalidParam(name, `must be an integer between 1 and ${MAX_SOURCE_ENDPOINT_TIMEOUT_MS}`);
    }
    return timeoutMs;
}

function required(value: string | undefined, name: string): string {
    if (!value) throw new MissingParam(name);
    return value;
}

function parseAccessBlob(raw: unknown, name: string): SourceEndpointAccess | undefined {
    if (raw === undefined || raw === "") return undefined;
    if (typeof raw !== "string") throw new InvalidParam(name, "expected a JSON string.");
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new InvalidParam(name, "must be valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new InvalidParam(name, "must be an object.");
    }
    const value = parsed as Record<string, unknown>;
    if (!isSourceEndpointAccessMode(value.mode)) {
        throw new InvalidParam(`${name}.mode`, "must be public|auth|admin|system.");
    }
    if (value.roles !== undefined) {
        throw new InvalidParam(`${name}.roles`, "is no longer supported; use admin access.");
    }
    return { mode: value.mode };
}

function parseEffectsBlob(raw: unknown, name: string): SourceEndpointEffects | undefined {
    if (raw === undefined || raw === "") return undefined;
    if (typeof raw !== "string") throw new InvalidParam(name, "expected a JSON string.");
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new InvalidParam(name, "must be valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new InvalidParam(name, "must be an object.");
    }
    const invalidatesSchema = (parsed as Record<string, unknown>).invalidatesSchema;
    if (invalidatesSchema === undefined) return undefined;
    if (invalidatesSchema !== true) throw new InvalidParam(`${name}.invalidatesSchema`, "must be true.");
    return { invalidatesSchema: true };
}

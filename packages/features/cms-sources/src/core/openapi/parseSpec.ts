import { SpecParseError } from "./SpecParseError";
import type { JSONSchema, ParsedSpec, PathItem } from "./types";
import { swagger2to3 } from "./swagger2to3";

/**
 * Parse an OpenAPI 3.x JSON spec from a raw string. Validates only the
 * essentials (`openapi: "3.x"` or `swagger: "2.0"`, `paths` object).
 * Swagger 2.0 inputs are normalised to a 3.x-shape via `swagger2to3`
 * (definitions → components.schemas, response.schema wrapped, refs
 * rewritten) so the resolver layer doesn't carry version branches.
 *
 * Empty `paths` is allowed (a source with no endpoints is just unused
 * yet, not malformed).
 */
export function parseSpec(raw: string): ParsedSpec {
    if (typeof raw !== "string" || raw.length === 0) {
        throw new SpecParseError("Spec is empty.");
    }

    let json: unknown;
    try { json = JSON.parse(raw); }
    catch (e) {
        throw new SpecParseError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!isObject(json)) {
        throw new SpecParseError("Spec root must be an object.");
    }

    const obj = json as Record<string, unknown>;
    const normalised = isSwagger2(obj)
        ? swagger2to3(obj)
        : obj;

    const version = normalised.openapi;
    if (typeof version !== "string") {
        throw new SpecParseError("Missing 'openapi' version field.");
    }
    if (!/^3\./.test(version)) {
        throw new SpecParseError(`Unsupported OpenAPI version "${version}". Only 3.x and Swagger 2.0 are supported.`);
    }

    if (!isObject(normalised.paths)) {
        throw new SpecParseError("Missing or invalid 'paths' object.");
    }

    const info = isObject(normalised.info) ? normalised.info : {};
    const components = isObject(normalised.components) ? normalised.components : {};

    return {
        info: {
            title:   typeof (info as any).title   === "string" ? (info as any).title   : "",
            version: typeof (info as any).version === "string" ? (info as any).version : "",
        },
        paths:      normalised.paths as Record<string, PathItem>,
        servers:    pickServers(normalised.servers),
        components: {
            schemas: isObject((components as any).schemas)
                ? (components as any).schemas as Record<string, JSONSchema>
                : {},
        },
    };
}

/** Keep only well-formed `{ url: string }` entries from the spec's `servers`. */
function pickServers(raw: unknown): { url: string }[] {
    if (!Array.isArray(raw)) return [];
    const out: { url: string }[] = [];
    for (const s of raw) {
        if (s && typeof s === "object" && typeof (s as any).url === "string") {
            out.push({ url: (s as any).url });
        }
    }
    return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSwagger2(obj: Record<string, unknown>): boolean {
    return typeof obj.swagger === "string" && /^2\./.test(obj.swagger);
}

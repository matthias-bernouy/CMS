import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { DataShape } from "@bernouy/cms-gateway";

/** The five DataShape node types (mirrors `@bernouy/cms-gateway`'s DataShape). */
const SHAPE_TYPES = ["string", "number", "boolean", "object", "array"] as const;
/** Guards against a hostile/runaway blob — the editor never authors near these.
 *  DEPTH caps nesting; NODES caps total breadth+depth (a wide object can't pass
 *  the depth check alone). */
const MAX_DEPTH = 10;
const MAX_NODES = 500;

/**
 * Validate + normalise an untrusted JSON value into a `DataShape`. The body/output
 * shapes arrive from the client as a JSON blob, so they are parsed here
 * defensively: unknown keys are dropped, the `type` is whitelisted, and both
 * nesting depth and total node count are capped. Throws `InvalidParam` on anything off.
 */
export function parseDataShape(value: unknown, path: string): DataShape {
    return walkShape(value, path, 0, { n: 0 });
}

function walkShape(value: unknown, path: string, depth: number, count: { n: number }): DataShape {
    if (depth >= MAX_DEPTH) throw new InvalidParam(path, "shape nested too deep");
    if (++count.n > MAX_NODES) throw new InvalidParam(path, "shape has too many nodes");
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new InvalidParam(path, "expected a shape object");
    }
    const v = value as Record<string, unknown>;
    if (typeof v.type !== "string" || !(SHAPE_TYPES as readonly string[]).includes(v.type)) {
        throw new InvalidParam(`${path}.type`, `must be ${SHAPE_TYPES.join("|")}`);
    }
    const type = v.type as DataShape["type"];
    const shape: DataShape = { type };

    if (type === "object" && v.properties != null) {
        if (typeof v.properties !== "object" || Array.isArray(v.properties)) {
            throw new InvalidParam(`${path}.properties`, "expected an object");
        }
        const props: Record<string, DataShape> = {};
        for (const [key, child] of Object.entries(v.properties as Record<string, unknown>)) {
            if (!key) throw new InvalidParam(`${path}.properties`, "property name cannot be empty");
            // Untrusted keys: a `__proto__`/`constructor`/`prototype` property would
            // corrupt the object's prototype on assignment — reject outright.
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
                throw new InvalidParam(`${path}.properties`, `unsafe property name "${key}"`);
            }
            props[key] = walkShape(child, `${path}.properties.${key}`, depth + 1, count);
        }
        if (Object.keys(props).length) shape.properties = props;
        // `required`: keep only declared OWN property names (defensive), deduped.
        // `Object.hasOwn` (not `in`) so prototype members like "toString" don't pass.
        if (Array.isArray(v.required)) {
            const req = [...new Set(v.required.filter((r): r is string => typeof r === "string" && Object.hasOwn(props, r)))];
            if (req.length) shape.required = req;
        }
    } else if (type === "array" && v.items != null) {
        shape.items = walkShape(v.items, `${path}.items`, depth + 1, count);
    }
    return shape;
}

/** Parse a JSON-blob form field into a `DataShape`, or `undefined` when blank.
 *  Used for the per-endpoint `body` / `output` hidden fields. */
export function parseShapeField(raw: unknown, path: string): DataShape | undefined {
    if (raw == null || raw === "") return undefined;
    if (typeof raw !== "string") throw new InvalidParam(path, "expected a JSON string");
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new InvalidParam(path, "invalid JSON");
    }
    return parseDataShape(parsed, path);
}

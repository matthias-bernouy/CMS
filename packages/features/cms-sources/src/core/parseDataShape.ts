import type { DataShape } from "../interfaces/DataShape";
import { SourceValidationError } from "./errors";

/** The five DataShape node types (mirrors `DataShape`). */
const SHAPE_TYPES = ["string", "number", "boolean", "object", "array"] as const;
/** Guards against a hostile/runaway blob — the editor never authors near these.
 *  DEPTH caps nesting; NODES caps total breadth+depth (a wide object can't pass
 *  the depth check alone). */
const MAX_DEPTH = 10;
const MAX_NODES = 500;

/**
 * Validate + normalise an untrusted JSON value into a `DataShape`. The body/output
 * shapes arrive from a client as a JSON blob, so they are parsed here
 * defensively: unknown keys are dropped, the `type` is whitelisted, and both
 * nesting depth and total node count are capped. Throws `SourceValidationError`
 * on anything off; `path` prefixes the error messages.
 */
export function parseDataShape(value: unknown, path: string): DataShape {
    return walkShape(value, path, 0, { n: 0 });
}

function walkShape(value: unknown, path: string, depth: number, count: { n: number }): DataShape {
    if (depth >= MAX_DEPTH) throw new SourceValidationError(path, "shape nested too deep");
    if (++count.n > MAX_NODES) throw new SourceValidationError(path, "shape has too many nodes");
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new SourceValidationError(path, "expected a shape object");
    }
    const v = value as Record<string, unknown>;
    if (typeof v.type !== "string" || !(SHAPE_TYPES as readonly string[]).includes(v.type)) {
        throw new SourceValidationError(`${path}.type`, `must be ${SHAPE_TYPES.join("|")}`);
    }
    const type = v.type as DataShape["type"];
    const shape: DataShape = { type };
    if (Object.hasOwn(v, "nullable")) {
        if (typeof v.nullable !== "boolean") {
            throw new SourceValidationError(`${path}.nullable`, "must be a boolean");
        }
        shape.nullable = v.nullable;
    }
    if (typeof v.title === "string" && v.title.trim()) shape.title = v.title.trim();
    if (v.semantic === "user-id") shape.semantic = { kind: "user-id" };
    else if (typeof v.semantic === "object" && v.semantic !== null && !Array.isArray(v.semantic)) {
        const semantic = v.semantic as Record<string, unknown>;
        if (semantic.kind !== "user-id") throw new SourceValidationError(`${path}.semantic.kind`, "must be user-id");
        shape.semantic = {
            kind: "user-id",
            ...(typeof semantic.authority === "string" && semantic.authority.trim()
                ? { authority: semantic.authority.trim() }
                : {}),
        };
    } else if (v.semantic !== undefined) {
        throw new SourceValidationError(`${path}.semantic`, "must be user-id or a semantic object");
    }

    if (type === "object" && v.properties != null) {
        if (typeof v.properties !== "object" || Array.isArray(v.properties)) {
            throw new SourceValidationError(`${path}.properties`, "expected an object");
        }
        const props: Record<string, DataShape> = {};
        for (const [key, child] of Object.entries(v.properties as Record<string, unknown>)) {
            if (!key) throw new SourceValidationError(`${path}.properties`, "property name cannot be empty");
            // Untrusted keys: a `__proto__`/`constructor`/`prototype` property would
            // corrupt the object's prototype on assignment — reject outright.
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
                throw new SourceValidationError(`${path}.properties`, `unsafe property name "${key}"`);
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

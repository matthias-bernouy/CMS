import type { DataShape } from "../../interfaces/DataShape";

export type DataShapeProjectionResult =
    | { ok: true; value: unknown }
    | { ok: false; reason: "type_mismatch" };

/**
 * Projects parsed JSON onto a declared data shape.
 *
 * C14 deliberately treats missing object properties and unstructured object/array
 * shapes as permissive. Required-property enforcement belongs to the later strict
 * contract pass.
 */
export function projectDataShape(value: unknown, shape: DataShape): DataShapeProjectionResult {
    if (value === null) return scalar(shape.nullable === true, value);

    switch (shape.type) {
        case "string":
            return scalar(typeof value === "string", value);
        case "number":
            return scalar(typeof value === "number" && Number.isFinite(value), value);
        case "boolean":
            return scalar(typeof value === "boolean", value);
        case "array":
            return projectArray(value, shape.items);
        case "object":
            return projectObject(value, shape.properties);
    }
}

function scalar(matches: boolean, value: unknown): DataShapeProjectionResult {
    return matches ? { ok: true, value } : { ok: false, reason: "type_mismatch" };
}

function projectArray(value: unknown, items: DataShape | undefined): DataShapeProjectionResult {
    if (!Array.isArray(value)) return { ok: false, reason: "type_mismatch" };
    if (!items) return { ok: true, value };

    const projected: unknown[] = [];
    for (const item of value) {
        const result = projectDataShape(item, items);
        if (!result.ok) return result;
        projected.push(result.value);
    }
    return { ok: true, value: projected };
}

function projectObject(
    value: unknown,
    properties: Record<string, DataShape> | undefined,
): DataShapeProjectionResult {
    if (!isObject(value)) return { ok: false, reason: "type_mismatch" };
    if (!properties || Object.keys(properties).length === 0) return { ok: true, value };

    const projected: Record<string, unknown> = {};
    for (const [name, propertyShape] of Object.entries(properties)) {
        if (!Object.hasOwn(value, name)) continue;
        const result = projectDataShape(value[name], propertyShape);
        if (!result.ok) return result;
        // Defining the property avoids the special `__proto__` assignment setter if
        // an executor is handed a shape that bypassed normal source validation.
        Object.defineProperty(projected, name, {
            configurable: true,
            enumerable: true,
            value: result.value,
            writable: true,
        });
    }
    return { ok: true, value: projected };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

import type { DataShape } from "../../interfaces/DataShape";

export type DataShapeProjectionResult =
    | { ok: true; value: unknown }
    | {
          ok: false;
          reason: "type_mismatch";
          path: string;
          expectedType: DataShape["type"];
          actualType: JsonValueType;
      };

export type JsonValueType = DataShape["type"] | "null" | "unknown";

/**
 * Projects parsed JSON onto a declared data shape.
 *
 * C14 deliberately treats missing object properties and unstructured object/array
 * shapes as permissive. Required-property enforcement belongs to the later strict
 * contract pass.
 */
export function projectDataShape(value: unknown, shape: DataShape, path = "$"): DataShapeProjectionResult {
    if (value === null) {
        return shape.nullable === true ? { ok: true, value } : mismatch(value, shape, path);
    }

    switch (shape.type) {
        case "string":
            return scalar(typeof value === "string", value, shape, path);
        case "number":
            return scalar(typeof value === "number" && Number.isFinite(value), value, shape, path);
        case "boolean":
            return scalar(typeof value === "boolean", value, shape, path);
        case "array":
            return projectArray(value, shape, path);
        case "object":
            return projectObject(value, shape, path);
    }
}

function scalar(matches: boolean, value: unknown, shape: DataShape, path: string): DataShapeProjectionResult {
    return matches ? { ok: true, value } : mismatch(value, shape, path);
}

function projectArray(value: unknown, shape: DataShape, path: string): DataShapeProjectionResult {
    if (!Array.isArray(value)) {
        return mismatch(value, shape, path);
    }
    if (!shape.items) {
        return { ok: true, value };
    }

    const projected: unknown[] = [];
    for (const item of value) {
        const result = projectDataShape(item, shape.items, `${path}[]`);
        if (!result.ok) {
            return result;
        }
        projected.push(result.value);
    }
    return { ok: true, value: projected };
}

function projectObject(value: unknown, shape: DataShape, path: string): DataShapeProjectionResult {
    if (!isObject(value)) {
        return mismatch(value, shape, path);
    }
    if (!shape.properties || Object.keys(shape.properties).length === 0) {
        return { ok: true, value };
    }

    const projected: Record<string, unknown> = {};
    for (const [name, propertyShape] of Object.entries(shape.properties)) {
        if (!Object.hasOwn(value, name)) {
            continue;
        }
        const result = projectDataShape(value[name], propertyShape, childPath(path, name));
        if (!result.ok) {
            return result;
        }
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

function mismatch(value: unknown, shape: DataShape, path: string): DataShapeProjectionResult {
    return {
        ok: false,
        reason: "type_mismatch",
        path,
        expectedType: shape.type,
        actualType: jsonValueType(value),
    };
}

function jsonValueType(value: unknown): JsonValueType {
    if (value === null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "array";
    }
    const type = typeof value;
    return type === "string" || type === "number" || type === "boolean" || type === "object" ? type : "unknown";
}

function childPath(path: string, property: string): string {
    return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(property) ? `${path}.${property}` : `${path}.*`;
}

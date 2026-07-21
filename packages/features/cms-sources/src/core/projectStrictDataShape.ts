import type { DataShape } from "../interfaces/DataShape";

export class DataShapeProjectionError extends Error {}

export type StrictDataShapeProjectionOptions = {
    enforceRequired?: boolean;
};

export function projectStrictDataShape(
    value: unknown,
    shape: DataShape,
    path = "body",
    options: StrictDataShapeProjectionOptions = {},
): unknown {
    if (value === null) {
        if (shape.nullable === true) {
            return null;
        }
        throw new DataShapeProjectionError(`${path} must be a ${shape.type}`);
    }
    if (shape.type === "object") {
        return projectObject(value, shape, path, options);
    }
    if (shape.type === "array") {
        return projectArray(value, shape, path, options);
    }
    if (typeof value !== shape.type || (shape.type === "number" && !Number.isFinite(value))) {
        throw new DataShapeProjectionError(`${path} must be a ${shape.type}`);
    }
    return value;
}

function projectObject(
    value: unknown,
    shape: DataShape,
    path: string,
    options: StrictDataShapeProjectionOptions,
): unknown {
    if (!isRecord(value)) {
        throw new DataShapeProjectionError(`${path} must be an object`);
    }
    const required = new Set(shape.required ?? []);
    if (options.enforceRequired !== false) {
        for (const key of required) {
            if (!Object.hasOwn(value, key) || value[key] === undefined) {
                throw new DataShapeProjectionError(`${path}.${key} is required`);
            }
        }
    }
    if (!shape.properties) {
        return value;
    }

    return Object.fromEntries(
        Object.entries(shape.properties)
            .filter(([key]) => Object.hasOwn(value, key) && value[key] !== undefined)
            .map(([key, child]) => [key, projectStrictDataShape(value[key], child, `${path}.${key}`, options)]),
    );
}

function projectArray(
    value: unknown,
    shape: DataShape,
    path: string,
    options: StrictDataShapeProjectionOptions,
): unknown {
    if (!Array.isArray(value)) {
        throw new DataShapeProjectionError(`${path} must be an array`);
    }
    if (!shape.items) {
        return value;
    }
    return value.map((item, index) => projectStrictDataShape(item, shape.items!, `${path}.${index}`, options));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

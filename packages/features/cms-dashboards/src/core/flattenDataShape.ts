import type { DataShape } from "@bernouy/cms-sources";

export type FlattenedInputType = "text" | "number" | "boolean";

export type FlattenedDataShapeField = {
    path: string;
    shape: DataShape;
    input: FlattenedInputType;
    required: boolean;
    array: boolean;
};

export function flattenDataShape(shape: DataShape): FlattenedDataShapeField[] {
    const fields: FlattenedDataShapeField[] = [];
    walk(shape, "", true, false, fields);
    return fields;
}

function walk(
    shape: DataShape,
    path: string,
    required: boolean,
    array: boolean,
    fields: FlattenedDataShapeField[],
): void {
    if (isScalar(shape)) {
        if (!path) return;
        fields.push({
            path,
            shape,
            input: inputType(shape),
            required,
            array,
        });
        return;
    }

    if (shape.type === "array") {
        if (shape.items) {
            walk(shape.items, path, required, true, fields);
        }
        return;
    }

    if (shape.type !== "object") return;

    const requiredProperties = new Set(shape.required ?? []);
    for (const [name, child] of Object.entries(shape.properties ?? {})) {
        const childPath = path ? `${path}.${name}` : name;
        walk(child, childPath, required && requiredProperties.has(name), array, fields);
    }
}

function isScalar(shape: DataShape): boolean {
    return shape.type === "string" || shape.type === "number" || shape.type === "boolean";
}

function inputType(shape: DataShape): FlattenedInputType {
    if (shape.type === "number") return "number";
    if (shape.type === "boolean") return "boolean";
    return "text";
}

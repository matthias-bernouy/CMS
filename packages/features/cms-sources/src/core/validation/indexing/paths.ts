import type { DataShape } from "cms-sources/interfaces/DataShape";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";
import { dataShapeAtPath } from "../parseDataShape";

export function validateResponsePath(
    endpoint: SourceEndpoint,
    value: string,
    expected: DataShape["type"],
    path: string,
    errors: string[],
): void {
    const valid =
        value.trim() && successShapes(endpoint).some((shape) => dataShapeAtPath(shape, value)?.type === expected);
    if (!valid) {
        errors.push(`${path} must reference a declared ${expected} response value`);
    }
}

export function validateItemPath(
    shapes: DataShape[],
    value: string,
    expected: DataShape["type"] | "scalar",
    path: string,
    errors: string[],
): void {
    const valid =
        value.trim() &&
        shapes.some((shape) => {
            const target = dataShapeAtPath(shape, value);
            return expected === "scalar"
                ? target?.type === "string" || target?.type === "number"
                : target?.type === expected;
        });
    if (!valid) {
        errors.push(`${path} must reference a declared ${expected} item value`);
    }
}

export function discoveryItems(endpoint: SourceEndpoint, path: string): DataShape[] {
    return successShapes(endpoint)
        .map((shape) => dataShapeAtPath(shape, path))
        .filter((shape): shape is DataShape => shape?.type === "array" && Boolean(shape.items))
        .map((shape) => shape.items!);
}

function successShapes(endpoint: SourceEndpoint): DataShape[] {
    return (endpoint.output ?? [])
        .filter((output) => output.status === "default" || /^2\d\d$/.test(output.status))
        .map((output) => output.body)
        .filter((shape): shape is DataShape => Boolean(shape));
}

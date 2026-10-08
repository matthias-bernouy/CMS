import type { UlviaSchema, UlviaStringSchema } from "../../interfaces/UlviaSchema";
import { matchesStringFormat } from "../schema/formats";
import { guaranteesObjectProperty } from "./schema/objectPresence";

/** Returns the first path where source values are not proven valid for target. */
export function firstSchemaSubsetViolation(source: UlviaSchema, target: UlviaSchema, path: string): string | null {
    if (source.type === "null") {
        return target.type === "null" || target.nullable ? null : `${path}.type`;
    }
    if (target.type === "null") {
        return `${path}.type`;
    }
    if (source.nullable && !target.nullable) {
        return `${path}.nullable`;
    }
    if (source.type !== target.type && !(source.type === "integer" && target.type === "number")) {
        return `${path}.type`;
    }
    switch (source.type) {
        case "array":
            if (target.type !== "array") {
                return `${path}.type`;
            }
            return (
                countViolation(source.minItems, source.maxItems, target.minItems, target.maxItems, path, "Items") ??
                firstSchemaSubsetViolation(source.items, target.items, `${path}.items`)
            );
        case "binary":
            if (target.type !== "binary") {
                return `${path}.type`;
            }
            if (source.maxBytes > target.maxBytes) {
                return `${path}.maxBytes`;
            }
            return null;
        case "boolean":
            return null;
        case "integer":
        case "number":
            if (target.type !== "integer" && target.type !== "number") {
                return `${path}.type`;
            }
            if ((source.minimum ?? -Infinity) < (target.minimum ?? -Infinity)) {
                return `${path}.minimum`;
            }
            return (source.maximum ?? Infinity) > (target.maximum ?? Infinity) ? `${path}.maximum` : null;
        case "map":
            if (target.type !== "map") {
                return `${path}.type`;
            }
            if (source.maxKeyLength > target.maxKeyLength) {
                return `${path}.maxKeyLength`;
            }
            return (
                countViolation(
                    source.minProperties,
                    source.maxProperties,
                    target.minProperties,
                    target.maxProperties,
                    path,
                    "Properties",
                ) ?? firstSchemaSubsetViolation(source.values, target.values, `${path}.values`)
            );
        case "object": {
            if (target.type !== "object") {
                return `${path}.type`;
            }
            for (const name of Object.keys(source.properties)) {
                if (!Object.hasOwn(target.properties, name)) {
                    return `${path}.properties.${name}`;
                }
            }
            for (const name of target.required) {
                if (!guaranteesObjectProperty(source, name)) {
                    return `${path}.required.${name}`;
                }
            }
            const count = countViolation(
                Math.max(source.minProperties ?? 0, source.required.length),
                source.maxProperties ?? Object.keys(source.properties).length,
                Math.max(target.minProperties ?? 0, target.required.length),
                target.maxProperties ?? Object.keys(target.properties).length,
                path,
                "Properties",
            );
            if (count) {
                return count;
            }
            for (const [name, property] of Object.entries(source.properties)) {
                const violation = firstSchemaSubsetViolation(
                    property,
                    target.properties[name]!,
                    `${path}.properties.${name}`,
                );
                if (violation) {
                    return violation;
                }
            }
            return null;
        }
        case "string":
            return target.type === "string" ? stringViolation(source, target, path) : `${path}.type`;
    }
}

function stringViolation(source: UlviaStringSchema, target: UlviaStringSchema, path: string): string | null {
    if (source.enum) {
        for (const value of source.enum) {
            if (value.length < (target.minLength ?? 0)) {
                return `${path}.minLength`;
            }
            if (value.length > target.maxLength) {
                return `${path}.maxLength`;
            }
            if (target.enum && !target.enum.includes(value)) {
                return `${path}.enum`;
            }
            if (target.format && !matchesStringFormat(value, target.format)) {
                return `${path}.format`;
            }
        }
        return null;
    }
    if (target.enum) {
        return `${path}.enum`;
    }
    if ((source.minLength ?? 0) < (target.minLength ?? 0)) {
        return `${path}.minLength`;
    }
    if (source.maxLength > target.maxLength) {
        return `${path}.maxLength`;
    }
    return target.format && source.format !== target.format ? `${path}.format` : null;
}

function countViolation(
    sourceMin: number | undefined,
    sourceMax: number,
    targetMin: number | undefined,
    targetMax: number,
    path: string,
    suffix: "Items" | "Properties",
): string | null {
    if ((sourceMin ?? 0) < (targetMin ?? 0)) {
        return `${path}.min${suffix}`;
    }
    return sourceMax > targetMax ? `${path}.max${suffix}` : null;
}

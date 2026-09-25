import type { UlviaObjectSchema, UlviaSchema } from "../../../interfaces/UlviaSchema";
import { firstSchemaSubsetViolation } from "../schemaAcceptance";
import { guaranteesObjectProperty } from "./objectPresence";

/** Proves that projecting every new output through the old schema remains valid. */
export function firstProjectedOutputViolation(source: UlviaSchema, target: UlviaSchema, path: string): string | null {
    if (source.type === "object" && target.type === "object") {
        return objectViolation(source, target, path);
    }
    if (source.type === "array" && target.type === "array") {
        return (
            firstSchemaSubsetViolation({ ...source, items: target.items }, target, path) ??
            firstProjectedOutputViolation(source.items, target.items, `${path}.items`)
        );
    }
    if (source.type === "map" && target.type === "map") {
        return (
            firstSchemaSubsetViolation({ ...source, values: target.values }, target, path) ??
            firstProjectedOutputViolation(source.values, target.values, `${path}.values`)
        );
    }
    return firstSchemaSubsetViolation(source, target, path);
}

function objectViolation(source: UlviaObjectSchema, target: UlviaObjectSchema, path: string): string | null {
    if (source.nullable && !target.nullable) {
        return `${path}.nullable`;
    }
    for (const name of Object.keys(target.properties)) {
        // Removing a previously available output is still a contract change,
        // even when old consumers did not require that property on every result.
        if (!Object.hasOwn(source.properties, name)) {
            return `${path}.properties.${name}`;
        }
    }
    for (const name of target.required) {
        if (!guaranteesObjectProperty(source, name)) {
            return `${path}.required.${name}`;
        }
    }
    const sourceNames = Object.keys(source.properties);
    const removed = sourceNames.filter((name) => !Object.hasOwn(target.properties, name));
    const removedRequired = source.required.filter((name) => !Object.hasOwn(target.properties, name)).length;
    const retainedRequired = source.required.length - removedRequired;
    const minimum = Math.max(
        retainedRequired,
        Math.max(source.minProperties ?? 0, source.required.length) - removed.length,
    );
    const maximum = Math.min(
        sourceNames.length - removed.length,
        (source.maxProperties ?? sourceNames.length) - removedRequired,
    );
    if (minimum < Math.max(target.minProperties ?? 0, target.required.length)) {
        return `${path}.minProperties`;
    }
    if (maximum > (target.maxProperties ?? Object.keys(target.properties).length)) {
        return `${path}.maxProperties`;
    }
    for (const [name, property] of Object.entries(target.properties)) {
        const violation = firstProjectedOutputViolation(
            source.properties[name]!,
            property,
            `${path}.properties.${name}`,
        );
        if (violation) {
            return violation;
        }
    }
    return null;
}

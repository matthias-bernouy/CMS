import type { CmsBindingInputValue } from "@bernouy/cms-content/bindings";
import { validateSchemaValue, type UlviaSchema } from "cms-repository/exports/contracts/schema";
import type { CollectionState } from "../../../../interfaces/CollectionState";
import { invalid } from "../../../errors";

export function validateStateInput(source: CmsBindingInputValue, state: CollectionState, path: string): void {
    if (source.from !== "state") {
        return;
    }
    const selected = selectSchema(state.schema, source.path ?? [], path);
    if (source.cast) {
        assertCastCompatible(selected, source.cast, path);
    }
    if (Object.hasOwn(source, "fallback")) {
        assertFallbackCompatible(selected, source.cast, source.fallback, path);
    }
}

function selectSchema(schema: UlviaSchema, selection: readonly (string | number)[], path: string): UlviaSchema {
    let selected = schema;
    for (const segment of selection) {
        if (selected.type === "object" && typeof segment === "string") {
            const property = selected.properties[segment];
            if (!property) {
                invalid(`state input path references unknown object property ${JSON.stringify(segment)}`, path);
            }
            selected = property;
            continue;
        }
        if (selected.type === "map" && typeof segment === "string") {
            selected = selected.values;
            continue;
        }
        if (selected.type === "array" && typeof segment === "number") {
            selected = selected.items;
            continue;
        }
        invalid(`state input path segment ${JSON.stringify(segment)} cannot select from ${selected.type}`, path);
    }
    return selected;
}

function assertCastCompatible(
    schema: UlviaSchema,
    cast: Exclude<CmsBindingInputValue, { from: "literal" }>["cast"],
    path: string,
): void {
    if ("nullable" in schema && schema.nullable) {
        invalid(`state input cannot cast nullable ${schema.type} values`, path);
    }
    const accepted =
        cast === "string"
            ? ["boolean", "integer", "number", "string"]
            : cast === "boolean"
              ? ["boolean", "string"]
              : cast === "integer"
                ? ["integer", "string"]
                : ["integer", "number", "string"];
    if (!accepted.includes(schema.type)) {
        invalid(`state input cannot cast ${schema.type} values to ${cast}`, path);
    }
}

function assertFallbackCompatible(
    schema: UlviaSchema,
    cast: Exclude<CmsBindingInputValue, { from: "literal" }>["cast"],
    fallback: unknown,
    path: string,
): void {
    if (!cast) {
        try {
            validateSchemaValue(schema, fallback, `${path}.fallback`);
        } catch {
            invalid(`state input fallback does not match the selected ${schema.type} schema`, path);
        }
        return;
    }
    if (!canCast(fallback, cast)) {
        invalid(`state input fallback cannot be cast to ${cast}`, path);
    }
}

function canCast(
    value: unknown,
    cast: NonNullable<Exclude<CmsBindingInputValue, { from: "literal" }>["cast"]>,
): boolean {
    if (cast === "string") {
        return (
            ["boolean", "number", "string"].includes(typeof value) &&
            (typeof value !== "number" || Number.isFinite(value))
        );
    }
    if (cast === "boolean") {
        return typeof value === "boolean" || value === "true" || value === "false";
    }
    if (typeof value === "number") {
        return Number.isFinite(value) && (cast === "number" || Number.isSafeInteger(value));
    }
    if (typeof value !== "string") {
        return false;
    }
    const pattern = cast === "number" ? /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u : /^-?(?:0|[1-9]\d*)$/u;
    const converted = Number(value);
    return pattern.test(value) && Number.isFinite(converted) && (cast === "number" || Number.isSafeInteger(converted));
}

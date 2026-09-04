import { IntegrationInputError } from "../../../errors";
import type { CollectionBindingValue, CollectionEndpointBindings } from "../../../../interfaces/IntegrationResources";
import { isRecord, text } from "../values";

const BLOC_VALUE = /^(props|state|context|route)\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export function parseEndpointBindings(value: unknown, name: string): CollectionEndpointBindings | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const input = parseBindingMap(value.input, `${name}.input`, "endpoint");
    const output = parseBindingMap(value.output, `${name}.output`, "bloc");
    const errors = parseBindingMap(value.errors, `${name}.errors`, "bloc");
    return {
        ...(input ? { input } : {}),
        ...(output ? { output: output as Record<CollectionBindingValue, string> } : {}),
        ...(errors ? { errors: errors as Record<CollectionBindingValue, string> } : {}),
    };
}

function parseBindingMap(
    value: unknown,
    name: string,
    keyKind: "endpoint" | "bloc",
): Record<string, CollectionBindingValue> | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const entries = Object.entries(value).map(([key, raw]) => {
        const parsed = text(raw);
        if (!parsed) {
            throw new IntegrationInputError(`${name}.${key}`, "must be a non-empty string");
        }
        if (keyKind === "bloc" && !BLOC_VALUE.test(key)) {
            throw new IntegrationInputError(`${name}.${key}`, "must target props, state, context, or route");
        }
        if (keyKind === "endpoint" && !/^(params|body)\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(key)) {
            throw new IntegrationInputError(`${name}.${key}`, "must target params.<name> or body.<path>");
        }
        if (keyKind === "endpoint" && !BLOC_VALUE.test(parsed)) {
            throw new IntegrationInputError(`${name}.${key}`, "must read props, state, context, or route");
        }
        return [key, parsed] as const;
    });
    return Object.fromEntries(entries) as Record<string, CollectionBindingValue>;
}

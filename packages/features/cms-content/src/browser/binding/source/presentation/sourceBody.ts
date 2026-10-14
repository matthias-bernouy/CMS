import {
    parseSourceBody,
    parseSyncTarget,
    type CmsBindingInputCast,
    type CmsJsonValue,
} from "cms-content/blocs/core/markup/bindings";
import { readSyncValue } from "../../params/SyncState";
import type { AdditionalFormFields, SerializedFormValue } from "../../submit/formSubmit";

export type ResolvedBindingInput =
    | { readonly ready: true; readonly fields: AdditionalFormFields }
    | { readonly ready: false };

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;
const JSON_INTEGER = /^-?(?:0|[1-9]\d*)$/u;

export function resolveBindingInput(value: string | null, doc: Document): ResolvedBindingInput {
    const binding = parseSourceBody(value);
    if (!binding) {
        return { ready: true, fields: {} };
    }

    const fields: AdditionalFormFields = {};
    for (const [name, source] of Object.entries(binding)) {
        if (!source || source.from === "literal") {
            if (source) {
                fields[name] = source.value as SerializedFormValue;
            }
            continue;
        }
        const target = parseSyncTarget(source.key);
        let selected = target ? selectPath(readSyncValue(target, doc), source.path) : undefined;
        if (selected === undefined) {
            if (Object.hasOwn(source, "fallback")) {
                selected = source.fallback;
            } else if (source.optional) {
                continue;
            } else {
                return { ready: false };
            }
        }
        fields[name] = castValue(selected, source.cast) as SerializedFormValue;
    }
    return { ready: true, fields };
}

function selectPath(value: unknown, path: readonly (string | number)[] | undefined): unknown {
    let selected = value;
    for (const segment of path ?? []) {
        if (selected === null || typeof selected !== "object" || !Object.hasOwn(selected, segment)) {
            return undefined;
        }
        selected = (selected as Record<string | number, unknown>)[segment];
    }
    return selected;
}

function castValue(value: unknown, cast: CmsBindingInputCast | undefined): CmsJsonValue {
    if (!cast) {
        return value as CmsJsonValue;
    }
    if (cast === "string") {
        if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
            return String(value);
        }
        throw new TypeError("CMS state input cannot cast a structured value to string");
    }
    if (cast === "boolean") {
        if (typeof value === "boolean") {
            return value;
        }
        if (value === "true" || value === "false") {
            return value === "true";
        }
        throw new TypeError('CMS state input boolean cast accepts only booleans or "true"/"false"');
    }
    if (typeof value === "number") {
        if (Number.isFinite(value) && (cast === "number" || Number.isSafeInteger(value))) {
            return value;
        }
        throw new TypeError(`CMS state input cannot cast the number to ${cast}`);
    }
    if (typeof value !== "string" || !(cast === "number" ? JSON_NUMBER : JSON_INTEGER).test(value)) {
        throw new TypeError(`CMS state input cannot cast the value to ${cast}`);
    }
    const converted = Number(value);
    if (!Number.isFinite(converted) || (cast === "integer" && !Number.isSafeInteger(converted))) {
        throw new TypeError(`CMS state input cannot cast the value to ${cast}`);
    }
    return converted;
}

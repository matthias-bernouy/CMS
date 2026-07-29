import { SOURCE_MEDIA_EFFECT_VERSION, type SourceEndpointDto } from "@bernouy/cms-sources";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isRecord, text } from "../../definition/values";

type Effects = NonNullable<SourceEndpointDto["effects"]>;
type Produced = NonNullable<Effects["producesMedia"]>[number];
type Removed = NonNullable<Effects["removesMedia"]>[number];
type Inventory = NonNullable<Effects["mediaInventory"]>;
type ProducedBase = Pick<Produced, "version" | "kind" | "targetEndpoint" | "itemsPath" | "params">;

const EFFECT_KEYS = new Set([
    "invalidatesSchema",
    "identityBindings",
    "producesMedia",
    "removesMedia",
    "mediaInventory",
]);
const MEDIA_KEYS = new Set([
    "version",
    "kind",
    "targetEndpoint",
    "itemsPath",
    "params",
    "revision",
    "width",
    "height",
    "preset",
    "cursor",
]);

export function parseEndpointEffects(value: unknown, name: string): Effects {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    rejectUnknownKeys(value, EFFECT_KEYS, name);
    if (value.invalidatesSchema !== undefined && value.invalidatesSchema !== true) {
        throw new IntegrationInputError(`${name}.invalidatesSchema`, "must be true");
    }
    const identityBindings = optionalArray(value.identityBindings, `${name}.identityBindings`, parseIdentityBinding);
    const producesMedia = optionalArray(value.producesMedia, `${name}.producesMedia`, parseProducedMedia);
    const removesMedia = optionalArray(value.removesMedia, `${name}.removesMedia`, parseRemovedMedia);
    const mediaInventory =
        value.mediaInventory === undefined
            ? undefined
            : parseMediaInventory(value.mediaInventory, `${name}.mediaInventory`);
    return {
        ...(value.invalidatesSchema === true ? { invalidatesSchema: true } : {}),
        ...(identityBindings?.length ? { identityBindings } : {}),
        ...(producesMedia?.length ? { producesMedia } : {}),
        ...(removesMedia?.length ? { removesMedia } : {}),
        ...(mediaInventory ? { mediaInventory } : {}),
    };
}

function parseIdentityBinding(value: unknown, name: string) {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    rejectUnknownKeys(value, new Set(["kind", "responsePath"]), name);
    if (value.kind !== "user") {
        throw new IntegrationInputError(`${name}.kind`, "must be user");
    }
    return { kind: "user" as const, responsePath: requiredText(value.responsePath, `${name}.responsePath`) };
}

function parseProducedMedia(value: unknown, name: string): Produced {
    return parseProduced(value, name, false);
}

function parseProduced(value: unknown, name: string, allowCursor: boolean): Produced {
    const shared = parseMediaEffect(value, name, false);
    const record = value as Record<string, unknown>;
    if (!allowCursor && record.cursor !== undefined) {
        throw new IntegrationInputError(`${name}.cursor`, "is supported only for media inventory");
    }
    return {
        ...shared,
        ...(record.revision !== undefined ? { revision: parseBinding(record.revision, `${name}.revision`) } : {}),
        ...(record.width !== undefined ? { width: parseBinding(record.width, `${name}.width`) } : {}),
        ...(record.height !== undefined ? { height: parseBinding(record.height, `${name}.height`) } : {}),
        ...(record.preset !== undefined ? { preset: requiredText(record.preset, `${name}.preset`) } : {}),
    };
}

function parseMediaInventory(value: unknown, name: string): Inventory {
    const produced = parseProduced(value, name, true);
    const record = value as Record<string, unknown>;
    if (!produced.itemsPath) {
        throw new MissingIntegrationParam(`${name}.itemsPath`);
    }
    return {
        ...produced,
        itemsPath: produced.itemsPath,
        ...(record.cursor !== undefined ? { cursor: parseCursor(record.cursor, `${name}.cursor`) } : {}),
    };
}

function parseCursor(value: unknown, name: string): NonNullable<Inventory["cursor"]> {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    rejectUnknownKeys(value, new Set(["responsePath", "requestParam"]), name);
    return {
        responsePath: requiredText(value.responsePath, `${name}.responsePath`),
        requestParam: requiredText(value.requestParam, `${name}.requestParam`),
    };
}

function parseRemovedMedia(value: unknown, name: string): Removed {
    const shared = parseMediaEffect(value, name, true);
    const record = value as Record<string, unknown>;
    for (const key of ["revision", "width", "height", "preset", "cursor"]) {
        if (record[key] !== undefined) {
            throw new IntegrationInputError(`${name}.${key}`, "is not supported for removed media");
        }
    }
    return shared;
}

function parseMediaEffect(value: unknown, name: string, allowRequestBindings: false): ProducedBase;
function parseMediaEffect(value: unknown, name: string, allowRequestBindings: true): Removed;
function parseMediaEffect(value: unknown, name: string, allowRequestBindings: boolean): Removed {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    rejectUnknownKeys(value, MEDIA_KEYS, name);
    if (value.version !== SOURCE_MEDIA_EFFECT_VERSION) {
        throw new IntegrationInputError(`${name}.version`, `must be ${SOURCE_MEDIA_EFFECT_VERSION}`);
    }
    if (value.kind !== "image") {
        throw new IntegrationInputError(`${name}.kind`, "must be image");
    }
    if (!isRecord(value.params) || Object.keys(value.params).length === 0) {
        throw new IntegrationInputError(`${name}.params`, "must be a non-empty object");
    }
    return {
        version: SOURCE_MEDIA_EFFECT_VERSION,
        kind: "image",
        targetEndpoint: requiredText(value.targetEndpoint, `${name}.targetEndpoint`),
        ...(value.itemsPath !== undefined ? { itemsPath: requiredText(value.itemsPath, `${name}.itemsPath`) } : {}),
        params: Object.fromEntries(
            Object.entries(value.params).map(([key, binding]) => {
                if (!key.trim()) {
                    throw new IntegrationInputError(`${name}.params`, "keys must not be empty");
                }
                return [key, parseBinding(binding, `${name}.params.${key}`, allowRequestBindings)];
            }),
        ),
    };
}

function parseBinding(value: unknown, name: string): Produced["params"][string];
function parseBinding(value: unknown, name: string, allowRequestParam: false): Produced["params"][string];
function parseBinding(value: unknown, name: string, allowRequestParam: true): Removed["params"][string];
function parseBinding(value: unknown, name: string, allowRequestParam: boolean): Removed["params"][string];
function parseBinding(value: unknown, name: string, allowRequestParam = false): Removed["params"][string] {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    rejectUnknownKeys(value, new Set(allowRequestParam ? ["responsePath", "requestParam"] : ["responsePath"]), name);
    if (allowRequestParam && value.requestParam !== undefined) {
        if (value.responsePath !== undefined) {
            throw new IntegrationInputError(name, "must declare exactly one binding source");
        }
        return { requestParam: requiredText(value.requestParam, `${name}.requestParam`) };
    }
    return { responsePath: requiredText(value.responsePath, `${name}.responsePath`) };
}

function optionalArray<T>(value: unknown, name: string, parse: (entry: unknown, name: string) => T): T[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => parse(entry, `${name}.${index}`));
}

function requiredText(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed) {
        throw new MissingIntegrationParam(name);
    }
    return parsed;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, name: string): void {
    const unknown = Object.keys(value).find((key) => !allowed.has(key));
    if (unknown) {
        throw new IntegrationInputError(`${name}.${unknown}`, "is not supported");
    }
}

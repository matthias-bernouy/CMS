import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isSupportedIntegrationVersionRange } from "../../../definitions/versioning";
import type {
    CollectionRequirement,
    CollectionResourceRequirements,
} from "../../../../interfaces/IntegrationResources";
import { isRecord, text } from "../values";

const SIMPLE_ID = /^[a-z0-9][a-z0-9-]*$/;

export function parseResourceRequirements(
    value: unknown,
    namespace: string,
    resourceName: string,
): CollectionResourceRequirements {
    const name = `${resourceName}.requires`;
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const resources = parseStringList(value.resources, `${name}.resources`);
    for (const resource of resources ?? []) {
        if (!resource.startsWith(namespace) || !SIMPLE_ID.test(resource.slice(namespace.length))) {
            throw new IntegrationInputError(`${name}.resources`, `must use the namespace ${namespace}<id>`);
        }
    }
    const currentKind = namespace.slice(0, -"/blocs/".length);
    const collections = parseCollections(value.collections, name, currentKind);
    if (!resources?.length && !collections?.length) {
        throw new IntegrationInputError(name, "must declare resources or collections");
    }
    return {
        ...(resources?.length ? { resources } : {}),
        ...(collections?.length ? { collections } : {}),
    };
}

function parseCollections(
    value: unknown,
    parentName: string,
    currentKind: string,
): CollectionRequirement[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const name = `${parentName}.collections`;
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    const requirements = value.map((entry, index) => parseCollection(entry, `${name}.${index}`, currentKind));
    if (new Set(requirements.map(({ kind }) => kind)).size !== requirements.length) {
        throw new IntegrationInputError(name, "must contain unique values");
    }
    return requirements;
}

function parseCollection(value: unknown, name: string, currentKind: string): CollectionRequirement {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const kind = requiredText(value.kind, `${name}.kind`);
    if (!SIMPLE_ID.test(kind)) {
        throw new IntegrationInputError(`${name}.kind`, "must be a lowercase kebab-case id");
    }
    if (kind === currentKind) {
        throw new IntegrationInputError(`${name}.kind`, "must use requires.resources for the same collection");
    }
    const resources = parseStringList(value.resources, `${name}.resources`) ?? [];
    if (!resources.length) {
        throw new IntegrationInputError(`${name}.resources`, "must contain at least one resource id");
    }
    const namespace = `${kind}/blocs/`;
    if (
        resources.some(
            (resource) => !resource.startsWith(namespace) || !SIMPLE_ID.test(resource.slice(namespace.length)),
        )
    ) {
        throw new IntegrationInputError(`${name}.resources`, `must use the namespace ${namespace}<id>`);
    }
    const version = requiredText(value.versionRange, `${name}.versionRange`);
    if (!isSupportedIntegrationVersionRange(version)) {
        throw new IntegrationInputError(
            `${name}.versionRange`,
            "must be an exact, caret, tilde, or bounded SemVer range",
        );
    }
    return { kind, versionRange: version, resources };
}

function parseStringList(value: unknown, name: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || value.some((entry) => !text(entry))) {
        throw new IntegrationInputError(name, "must be an array of non-empty strings");
    }
    const values = value.map((entry) => text(entry)!);
    if (new Set(values).size !== values.length) {
        throw new IntegrationInputError(name, "must contain unique values");
    }
    return values;
}

function requiredText(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed) {
        throw new MissingIntegrationParam(name);
    }
    return parsed;
}

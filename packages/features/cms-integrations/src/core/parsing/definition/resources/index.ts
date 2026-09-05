import { isEndpointUrn } from "@bernouy/cms-sources";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isSupportedIntegrationVersionRange } from "../../../definitions/versioning";
import {
    ULVIA_THEME_CONTRACT_V1,
    ULVIA_THEME_CONTRACT_V2,
    ULVIA_THEME_CONTRACT_V3,
    type UlviaThemeContract,
} from "../../../../interfaces/IntegrationResources";
import type {
    CollectionEndpointRequirement,
    CollectionResource,
    CollectionResourceCategory,
    CollectionThemeRequirement,
} from "../../../../interfaces/IntegrationResources";
import { parseThemeCssValue } from "../metadata/cssValue";
import { isRecord, text } from "../values";
import { parseEndpointBindings } from "./bindings";
import { parseResourceRequirements } from "./requirements";

const SIMPLE_ID = /^[a-z0-9][a-z0-9-]*$/;

export function parseCollectionCategories(value: unknown): CollectionResourceCategory[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError("definition.resourceCategories", "must be an array");
    }
    const categories = value.map((entry, index) => parseCategory(entry, `definition.resourceCategories.${index}`));
    assertUnique(
        categories.map(({ id }) => id),
        "definition.resourceCategories",
    );
    return categories;
}

export function parseCollectionResources(value: unknown, kind: string): CollectionResource[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError("definition.resources", "must be an array");
    }
    const resources = value.map((entry, index) => parseResource(entry, kind, index));
    assertUnique(
        resources.map(({ id }) => id),
        "definition.resources",
    );
    assertUnique(
        resources.map(({ artifact }) => artifact),
        "definition.resources.artifact",
    );
    return resources;
}

function parseCategory(value: unknown, name: string): CollectionResourceCategory {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const id = requiredText(value.id, `${name}.id`);
    if (!SIMPLE_ID.test(id)) {
        throw new IntegrationInputError(`${name}.id`, "must be a lowercase kebab-case id");
    }
    return {
        id,
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
    };
}

function parseResource(value: unknown, kind: string, index: number): CollectionResource {
    const name = `definition.resources.${index}`;
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    if (value.type !== "bloc") {
        throw new IntegrationInputError(`${name}.type`, "must be bloc");
    }
    const namespace = `${kind}/blocs/`;
    const id = requiredText(value.id, `${name}.id`);
    if (!id.startsWith(namespace) || !SIMPLE_ID.test(id.slice(namespace.length))) {
        throw new IntegrationInputError(`${name}.id`, `must use the namespace ${namespace}<id>`);
    }
    const artifact = requiredText(value.artifact, `${name}.artifact`);
    const artifactNamespace = `${kind}-`;
    if (
        !SIMPLE_ID.test(artifact) ||
        !artifact.startsWith(artifactNamespace) ||
        !SIMPLE_ID.test(artifact.slice(artifactNamespace.length))
    ) {
        throw new IntegrationInputError(`${name}.artifact`, `must use the namespace ${artifactNamespace}<id>`);
    }
    const context = parseStringList(value.context, `${name}.context`);
    return {
        id,
        type: "bloc",
        artifact,
        category: requiredText(value.category, `${name}.category`),
        ...(value.defaultActive === true ? { defaultActive: true } : {}),
        ...(value.endpoints === undefined ? {} : { endpoints: parseEndpoints(value.endpoints, `${name}.endpoints`) }),
        ...(value.requires === undefined
            ? {}
            : { requires: parseResourceRequirements(value.requires, namespace, name) }),
        ...(context ? { context } : {}),
        ...(value.theme === undefined ? {} : { theme: parseTheme(value.theme, `${name}.theme`) }),
    };
}

function parseEndpoints(value: unknown, name: string): CollectionEndpointRequirement[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    const endpoints = value.map((entry, index) => parseEndpoint(entry, `${name}.${index}`));
    assertUnique(
        endpoints.map(({ endpoint }) => endpoint),
        name,
    );
    return endpoints;
}

function parseEndpoint(value: unknown, name: string): CollectionEndpointRequirement {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const endpoint = requiredText(value.endpoint, `${name}.endpoint`);
    if (!isEndpointUrn(endpoint)) {
        throw new IntegrationInputError(`${name}.endpoint`, "must be an endpoint URN");
    }
    const sourceVersion = versionRange(value.sourceVersion, `${name}.sourceVersion`);
    const contractVersion = versionRange(value.contractVersion, `${name}.contractVersion`);
    const bindings = parseEndpointBindings(value.bindings, `${name}.bindings`);
    return {
        source: requiredText(value.source, `${name}.source`),
        sourceVersion,
        endpoint: endpoint as CollectionEndpointRequirement["endpoint"],
        contractVersion,
        ...(bindings ? { bindings } : {}),
    };
}

function parseTheme(value: unknown, name: string): CollectionThemeRequirement {
    if (
        !isRecord(value) ||
        (value.contract !== ULVIA_THEME_CONTRACT_V1 &&
            value.contract !== ULVIA_THEME_CONTRACT_V2 &&
            value.contract !== ULVIA_THEME_CONTRACT_V3)
    ) {
        throw new IntegrationInputError(
            `${name}.contract`,
            `must be ${ULVIA_THEME_CONTRACT_V1}, ${ULVIA_THEME_CONTRACT_V2}, or ${ULVIA_THEME_CONTRACT_V3}`,
        );
    }
    const required = parseStringList(value.required, `${name}.required`);
    const optional = value.optional;
    if (optional !== undefined && !Array.isArray(optional)) {
        throw new IntegrationInputError(`${name}.optional`, "must be an array");
    }
    return {
        contract: value.contract as UlviaThemeContract,
        ...(required ? { required } : {}),
        ...(optional
            ? {
                  optional: optional.map((entry, index) => {
                      if (!isRecord(entry)) {
                          throw new IntegrationInputError(`${name}.optional.${index}`, "must be an object");
                      }
                      return {
                          id: requiredText(entry.id, `${name}.optional.${index}.id`),
                          fallback: parseThemeCssValue(entry.fallback, `${name}.optional.${index}.fallback`),
                      };
                  }),
              }
            : {}),
    };
}

function parseStringList(value: unknown, name: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || value.some((entry) => !text(entry))) {
        throw new IntegrationInputError(name, "must be an array of non-empty strings");
    }
    const values = value.map((entry) => text(entry)!);
    assertUnique(values, name);
    return values;
}

function versionRange(value: unknown, name: string): string {
    const range = requiredText(value, name);
    if (!isSupportedIntegrationVersionRange(range)) {
        throw new IntegrationInputError(name, "must be an exact, caret, tilde, or bounded SemVer range");
    }
    return range;
}

function requiredText(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed) {
        throw new MissingIntegrationParam(name);
    }
    return parsed;
}

function assertUnique(values: readonly string[], name: string): void {
    if (new Set(values).size !== values.length) {
        throw new IntegrationInputError(name, "must contain unique values");
    }
}

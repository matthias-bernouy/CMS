import {
    dataShapeAtPath,
    parseUrn,
    sourceDtoToSource,
    type DataShape,
    type EndpointResponse,
} from "@bernouy/cms-sources";
import { IntegrationInputError } from "../errors";
import { integrationVersionSatisfies } from "../definitions/versioning";
import type { CollectionIntegrationDefinition, IntegrationDefinition } from "../../interfaces/Integration";
import type { CollectionEndpointRequirement, CollectionResource } from "../../interfaces/IntegrationResources";
import { resolveCollectionDependencies } from "./dependencySelection";

export function assertCollectionConformance(
    collection: CollectionIntegrationDefinition,
    availableDefinitions: readonly IntegrationDefinition[],
    selectedResources?: readonly string[],
): void {
    const selection = resolveCollectionDependencies(
        collection,
        selectedResources ?? collection.resources.map(({ id }) => id),
        availableDefinitions,
    );
    const effectiveResources = new Set(
        selection.effectiveResources.find(({ kind }) => kind === collection.kind)?.resources ?? [],
    );
    const definitions = groupDefinitions(availableDefinitions);
    const themeTokens = new Set(
        (collection.theme?.categories ?? []).flatMap(({ tokens }) => tokens.map(({ id }) => id)),
    );
    for (const token of assertThemeDependencies(collection, definitions)) {
        themeTokens.add(token);
    }
    for (const resource of collection.resources.filter(({ id }) => effectiveResources.has(id))) {
        assertThemeReferences(resource, themeTokens);
        for (const requirement of resource.endpoints ?? []) {
            assertEndpointRequirement(resource, requirement, definitions);
        }
    }
}

function assertThemeDependencies(
    collection: CollectionIntegrationDefinition,
    definitions: ReadonlyMap<string, readonly IntegrationDefinition[]>,
): ReadonlySet<string> {
    const dependencies = collection.theme?.dependencies ?? [];
    const localTokens = new Set(collection.theme?.categories.flatMap(({ tokens }) => tokens.map(({ id }) => id)) ?? []);
    const providers = new Map<string, Set<string>>();
    for (const dependency of dependencies) {
        const candidates = (definitions.get(dependency.kind) ?? []).filter(
            (definition): definition is CollectionIntegrationDefinition =>
                definition.schema === "cms.integration.definition.v2" &&
                definition.type === "collection" &&
                definition.theme !== undefined,
        );
        const definition = candidates.find(
            ({ version }) => version && integrationVersionSatisfies(version, dependency.versionRange),
        );
        const path = `theme.dependencies.${dependency.kind}`;
        if (candidates.length === 0) {
            throw new IntegrationInputError(path, `requires missing theme collection "${dependency.kind}"`);
        }
        if (!definition) {
            throw new IntegrationInputError(
                path,
                `requires theme collection "${dependency.kind}" version ${dependency.versionRange}, got ${candidates.map(({ version }) => version ?? "unversioned").join(", ")}`,
            );
        }
        const theme = definition.theme;
        if (!theme) {
            throw new IntegrationInputError(path, `theme collection "${dependency.kind}" does not publish a theme`);
        }
        providers.set(dependency.kind, new Set(theme.categories.flatMap(({ tokens }) => tokens.map(({ id }) => id))));
    }
    const knownThemeKinds = [...definitions.entries()]
        .filter(([, candidates]) =>
            candidates.some(
                (definition) =>
                    definition.schema === "cms.integration.definition.v2" &&
                    definition.type === "collection" &&
                    definition.theme !== undefined,
            ),
        )
        .map(([kind]) => kind)
        .sort((left, right) => right.length - left.length);
    for (const token of collection.theme?.categories.flatMap(({ tokens }) => tokens) ?? []) {
        for (const value of Object.values(token.defaults)) {
            for (const match of value.matchAll(/var\s*\(\s*--([a-z][a-z0-9-]*)/giu)) {
                const variable = match[1]!.toLowerCase();
                if (variable.startsWith("site-")) {
                    throw new IntegrationInputError(
                        `theme.tokens.${token.id}`,
                        `published theme token cannot depend on site variable "${variable}"`,
                    );
                }
                if (variable.startsWith(`${collection.kind}-`)) {
                    const localToken = variable.slice(collection.kind.length + 1);
                    if (!localTokens.has(localToken)) {
                        throw new IntegrationInputError(
                            `theme.tokens.${token.id}`,
                            `references missing local theme token "${variable}"`,
                        );
                    }
                    continue;
                }
                const provider = dependencies.find(({ kind }) => variable.startsWith(`${kind}-`));
                const providerToken = provider ? variable.slice(provider.kind.length + 1) : "";
                const knownProvider = knownThemeKinds.find((kind) => variable.startsWith(`${kind}-`));
                if (knownProvider && (!provider || !providers.get(provider.kind)?.has(providerToken))) {
                    throw new IntegrationInputError(
                        `theme.tokens.${token.id}`,
                        `references undeclared or missing collection theme token "${variable}"`,
                    );
                }
            }
        }
    }
    return new Set([...providers.values()].flatMap((tokens) => [...tokens]));
}

function assertEndpointRequirement(
    resource: CollectionResource,
    requirement: CollectionEndpointRequirement,
    definitions: ReadonlyMap<string, readonly IntegrationDefinition[]>,
): void {
    const candidates = definitions.get(requirement.source) ?? [];
    const path = `resources.${resource.id}.endpoints.${requirement.endpoint}`;
    if (candidates.length === 0) {
        throw new IntegrationInputError(path, `requires missing source integration "${requirement.source}"`);
    }
    const sources = candidates.filter(
        (definition) => definition.schema !== "cms.integration.definition.v2" || definition.type === "source",
    );
    if (sources.length === 0) {
        throw new IntegrationInputError(path, `"${requirement.source}" is not a source integration`);
    }
    const sourceDefinition = sources.find(
        ({ version }) => version && integrationVersionSatisfies(version, requirement.sourceVersion),
    );
    if (!sourceDefinition) {
        throw new IntegrationInputError(
            path,
            `requires source "${requirement.source}" version ${requirement.sourceVersion}, got ${sources.map(({ version }) => version ?? "unversioned").join(", ")}`,
        );
    }
    const endpoints = (sourceDefinition.artifacts ?? []).flatMap((artifact): ConformanceEndpoint[] => {
        if (artifact.type === "source") {
            return sourceDtoToSource(artifact.source).endpoints.map((endpoint) => ({
                urn: endpoint.urn,
                contractVersion: endpoint.contractVersion,
                params: new Set(endpoint.input?.params?.map(({ name }) => name)),
                requiredParams: new Set(
                    endpoint.input?.params?.filter(({ required }) => required).map(({ name }) => name),
                ),
                body: endpoint.input?.body,
                output: endpoint.output,
            }));
        }
        if (artifact.type === "function") {
            return [
                {
                    urn: `urn:system-functions:${artifact.function.id}`,
                    contractVersion: artifact.contractVersion,
                    params: new Set(Object.keys(artifact.function.input?.params ?? {})),
                    requiredParams: new Set(Object.keys(artifact.function.input?.params ?? {})),
                    body: artifact.function.input?.body,
                    output: artifact.function.output,
                },
            ];
        }
        return [];
    });
    const requiredUrn = parseUrn(requirement.endpoint);
    const requiredEndpointId = requiredUrn?.endpoint;
    const matchingEndpoints = endpoints.filter(({ urn }) => {
        const candidate = parseUrn(urn);
        return (
            candidate !== null &&
            candidate.endpoint === requiredEndpointId &&
            (requiredUrn?.source === "system-functions"
                ? candidate.source === "system-functions"
                : candidate.source !== "system-functions")
        );
    });
    if (matchingEndpoints.length > 1) {
        throw new IntegrationInputError(
            path,
            `endpoint id "${requiredEndpointId}" is ambiguous in source integration "${requirement.source}"`,
        );
    }
    const endpoint = matchingEndpoints[0];
    if (!endpoint) {
        throw new IntegrationInputError(path, `references missing endpoint "${requirement.endpoint}"`);
    }
    if (
        !endpoint.contractVersion ||
        !integrationVersionSatisfies(endpoint.contractVersion, requirement.contractVersion)
    ) {
        throw new IntegrationInputError(
            path,
            `requires endpoint contract ${requirement.contractVersion}, got ${endpoint.contractVersion ?? "unversioned"}`,
        );
    }
    assertBindings(resource, requirement, endpoint, path);
}

function assertBindings(
    resource: CollectionResource,
    requirement: CollectionEndpointRequirement,
    endpoint: ConformanceEndpoint,
    path: string,
): void {
    const bindings = requirement.bindings;
    const requiredInputPaths = [
        ...[...endpoint.requiredParams].map((name) => `params.${name}`),
        ...requiredBodyProperties(endpoint.body).map((name) => `body.${name}`),
    ];
    const missing = requiredInputPaths.filter((target) => !bindings?.input?.[target]);
    if (missing.length) {
        throw new IntegrationInputError(path, `missing required input bindings: ${missing.join(", ")}`);
    }
    for (const [target, value] of Object.entries(bindings?.input ?? {})) {
        assertContextDeclared(resource, value, path);
        if (target.startsWith("params.")) {
            const name = target.slice("params.".length);
            if (!endpoint.params.has(name)) {
                throw new IntegrationInputError(path, `input binding targets missing endpoint parameter "${name}"`);
            }
        } else if (!dataShapeAtPath(endpoint.body, target.slice("body.".length))) {
            throw new IntegrationInputError(path, `input binding targets missing endpoint body path "${target}"`);
        }
    }
    for (const [target, source] of [
        ...Object.entries(bindings?.output ?? {}),
        ...Object.entries(bindings?.errors ?? {}),
    ]) {
        assertContextDeclared(resource, target, path);
        assertResponsePath(endpoint, source, path);
    }
}

function assertResponsePath(endpoint: ConformanceEndpoint, path: string, errorPath: string): void {
    const match = /^(default|[1-5][0-9][0-9])\.body(?:\.(.+))?$/.exec(path);
    if (!match) {
        throw new IntegrationInputError(errorPath, `invalid endpoint response binding path "${path}"`);
    }
    const response = endpoint.output?.find(({ status }) => status === match[1]);
    if (!response?.body || (match[2] && !dataShapeAtPath(response.body, match[2], { implicitArrayItems: true }))) {
        throw new IntegrationInputError(errorPath, `response binding targets missing path "${path}"`);
    }
}

type ConformanceEndpoint = {
    urn: string;
    contractVersion?: string;
    params: ReadonlySet<string>;
    requiredParams: ReadonlySet<string>;
    body?: DataShape;
    output?: EndpointResponse[];
};

function requiredBodyProperties(body: DataShape | undefined): string[] {
    if (!body || body.type !== "object") {
        return [];
    }
    return body.required ?? [];
}

function assertContextDeclared(resource: CollectionResource, binding: string, path: string): void {
    if (!binding.startsWith("context.")) {
        return;
    }
    const name = binding.split(".")[1]!;
    if (!(resource.context ?? []).includes(name)) {
        throw new IntegrationInputError(path, `binding uses undeclared context "${name}"`);
    }
}

function assertThemeReferences(resource: CollectionResource, tokens: ReadonlySet<string>): void {
    for (const id of [...(resource.theme?.required ?? []), ...(resource.theme?.optional ?? []).map(({ id }) => id)]) {
        if (!tokens.has(id)) {
            throw new IntegrationInputError(`resources.${resource.id}.theme`, `references missing theme token "${id}"`);
        }
    }
}

function groupDefinitions(
    definitions: readonly IntegrationDefinition[],
): ReadonlyMap<string, readonly IntegrationDefinition[]> {
    const grouped = new Map<string, IntegrationDefinition[]>();
    for (const definition of definitions) {
        const candidates = grouped.get(definition.kind) ?? [];
        if (!candidates.some(({ version }) => version === definition.version)) {
            candidates.push(definition);
            grouped.set(definition.kind, candidates);
        }
    }
    return grouped;
}

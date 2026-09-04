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
): void {
    resolveCollectionDependencies(
        collection,
        collection.resources.map(({ id }) => id),
        availableDefinitions,
    );
    const definitions = new Map(availableDefinitions.map((definition) => [definition.kind, definition]));
    const themeTokens = new Set(
        (collection.theme?.categories ?? []).flatMap(({ tokens }) => tokens.map(({ id }) => id)),
    );
    for (const resource of collection.resources) {
        assertThemeReferences(resource, themeTokens);
        for (const requirement of resource.endpoints ?? []) {
            assertEndpointRequirement(resource, requirement, definitions);
        }
    }
}

function assertEndpointRequirement(
    resource: CollectionResource,
    requirement: CollectionEndpointRequirement,
    definitions: ReadonlyMap<string, IntegrationDefinition>,
): void {
    const sourceDefinition = definitions.get(requirement.source);
    const path = `resources.${resource.id}.endpoints.${requirement.endpoint}`;
    if (!sourceDefinition) {
        throw new IntegrationInputError(path, `requires missing source integration "${requirement.source}"`);
    }
    if (sourceDefinition.schema === "cms.integration.definition.v2" && sourceDefinition.type !== "source") {
        throw new IntegrationInputError(path, `"${requirement.source}" is not a source integration`);
    }
    if (
        !sourceDefinition.version ||
        !integrationVersionSatisfies(sourceDefinition.version, requirement.sourceVersion)
    ) {
        throw new IntegrationInputError(
            path,
            `requires source "${requirement.source}" version ${requirement.sourceVersion}, got ${sourceDefinition.version ?? "unversioned"}`,
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

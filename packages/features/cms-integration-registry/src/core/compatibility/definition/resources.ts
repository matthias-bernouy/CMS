import { isDeepStrictEqual } from "node:util";
import {
    integrationVersionRangeContainsRange,
    type CollectionEndpointRequirement,
    type CollectionIntegrationDefinition,
    type CollectionResource,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";
import { compareCollectionResourceRequirements } from "./resourceRequirements";

export function compareCollectionResources(
    baseline: IntegrationDefinition,
    candidate: IntegrationDefinition,
    add: CompatibilityChangeSink,
): void {
    if (!isCollection(baseline) || !isCollection(candidate)) {
        return;
    }
    const previous = new Map(baseline.resources.map((resource) => [resource.id, resource]));
    const next = new Map(candidate.resources.map((resource) => [resource.id, resource]));
    for (const [id, resource] of previous) {
        const candidateResource = next.get(id);
        const path = `resources.${id}`;
        if (!candidateResource) {
            add(
                "breaking",
                "definition",
                "collection-resource-removed",
                path,
                "Collection resource was removed or renamed",
            );
            continue;
        }
        compareResource(resource, candidateResource, path, add);
    }
    for (const [id] of next) {
        if (!previous.has(id)) {
            add(
                "additive",
                "definition",
                "collection-resource-added",
                `resources.${id}`,
                "Collection resource was added",
            );
        }
    }
}

function compareResource(
    baseline: CollectionResource,
    candidate: CollectionResource,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline.type !== candidate.type || baseline.artifact !== candidate.artifact) {
        add("breaking", "definition", "collection-resource-target-changed", path, "Collection resource target changed");
        return;
    }
    compareStringRequirements(baseline.context, candidate.context, `${path}.context`, "context", add);
    compareCollectionResourceRequirements(baseline.requires, candidate.requires, `${path}.requires`, add);
    compareTheme(baseline, candidate, path, add);
    compareEndpoints(baseline.endpoints ?? [], candidate.endpoints ?? [], `${path}.endpoints`, add);
}

function compareEndpoints(
    baseline: readonly CollectionEndpointRequirement[],
    candidate: readonly CollectionEndpointRequirement[],
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previous = new Map(baseline.map((requirement) => [endpointIdentity(requirement), requirement]));
    const next = new Map(candidate.map((requirement) => [endpointIdentity(requirement), requirement]));
    for (const [identity, requirement] of previous) {
        const candidateRequirement = next.get(identity);
        const requirementPath = `${path}.${identity}`;
        if (!candidateRequirement) {
            add(
                "additive",
                "definition",
                "collection-endpoint-requirement-removed",
                requirementPath,
                "Endpoint requirement was removed",
            );
            continue;
        }
        compareRange(
            requirement.sourceVersion,
            candidateRequirement.sourceVersion,
            `${requirementPath}.sourceVersion`,
            "source",
            add,
        );
        compareRange(
            requirement.contractVersion,
            candidateRequirement.contractVersion,
            `${requirementPath}.contractVersion`,
            "contract",
            add,
        );
        if (!isDeepStrictEqual(requirement.bindings, candidateRequirement.bindings)) {
            add(
                "breaking",
                "definition",
                "collection-endpoint-bindings-changed",
                `${requirementPath}.bindings`,
                "Endpoint bindings changed",
            );
        }
    }
    for (const [identity] of next) {
        if (!previous.has(identity)) {
            add(
                "breaking",
                "definition",
                "collection-endpoint-requirement-added",
                `${path}.${identity}`,
                "Endpoint requirement was added to an existing resource",
            );
        }
    }
}

function compareRange(
    baseline: string,
    candidate: string,
    path: string,
    subject: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline === candidate) {
        return;
    }
    if (integrationVersionRangeContainsRange(candidate, baseline)) {
        add(
            "additive",
            "definition",
            `collection-${subject}-range-widened`,
            path,
            `${subject} version range was widened`,
        );
        return;
    }
    add(
        "breaking",
        "definition",
        `collection-${subject}-range-narrowed`,
        path,
        `${subject} version range became incompatible with previously supported versions`,
    );
}

function compareTheme(
    baseline: CollectionResource,
    candidate: CollectionResource,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline.theme?.contract !== candidate.theme?.contract) {
        add(
            "breaking",
            "definition",
            "collection-theme-contract-changed",
            `${path}.theme.contract`,
            `Theme contract changed from ${baseline.theme?.contract ?? "none"} to ${candidate.theme?.contract ?? "none"}`,
        );
    }
    compareStringRequirements(
        baseline.theme?.required,
        candidate.theme?.required,
        `${path}.theme.required`,
        "theme token",
        add,
    );
    const previous = new Map((baseline.theme?.optional ?? []).map((token) => [token.id, token.fallback]));
    const next = new Map((candidate.theme?.optional ?? []).map((token) => [token.id, token.fallback]));
    for (const [id, fallback] of previous) {
        if (!next.has(id)) {
            add(
                "additive",
                "definition",
                "collection-optional-theme-token-removed",
                `${path}.theme.optional.${id}`,
                "Optional theme token was removed",
            );
        } else if (next.get(id) !== fallback) {
            add(
                "breaking",
                "definition",
                "collection-theme-fallback-changed",
                `${path}.theme.optional.${id}`,
                "Theme fallback changed",
            );
        }
    }
    for (const [id] of next) {
        if (!previous.has(id)) {
            add(
                "additive",
                "definition",
                "collection-optional-theme-token-added",
                `${path}.theme.optional.${id}`,
                "Optional theme token was added",
            );
        }
    }
}

function compareStringRequirements(
    baseline: readonly string[] | undefined,
    candidate: readonly string[] | undefined,
    path: string,
    subject: string,
    add: CompatibilityChangeSink,
): void {
    const previous = new Set(baseline ?? []);
    const next = new Set(candidate ?? []);
    for (const value of previous) {
        if (!next.has(value)) {
            add(
                "additive",
                "definition",
                `collection-${slug(subject)}-removed`,
                `${path}.${value}`,
                `${subject} requirement was removed`,
            );
        }
    }
    for (const value of next) {
        if (!previous.has(value)) {
            add(
                "breaking",
                "definition",
                `collection-${slug(subject)}-added`,
                `${path}.${value}`,
                `${subject} requirement was added`,
            );
        }
    }
}

function endpointIdentity(requirement: CollectionEndpointRequirement): string {
    return `${requirement.source}:${requirement.endpoint}`;
}

function slug(value: string): string {
    return value.replaceAll(" ", "-");
}

function isCollection(definition: IntegrationDefinition): definition is CollectionIntegrationDefinition {
    return definition.schema === "cms.integration.definition.v2" && definition.type === "collection";
}

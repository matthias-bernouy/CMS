import { isDeepStrictEqual } from "node:util";
import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import {
    IntegrationRepositoryContractError,
    IntegrationRepositoryError,
    type IntegrationDefinition,
    type IntegrationDefinitionIndex,
    type IntegrationDefinitionRepository,
    type IntegrationDefinitionSummary,
} from "@bernouy/cms-integrations";
import { BoundedCatalogWork, type RepositoryCatalogReaderLimits } from "../limits";

const encoder = new TextEncoder();

export async function catalogSummaries(
    catalog: IntegrationDefinitionRepository,
    work: BoundedCatalogWork,
    limits: RepositoryCatalogReaderLimits,
): Promise<readonly IntegrationDefinitionSummary[]> {
    const value = await catalogCall(work, () => catalog.list());
    if (!Array.isArray(value) || value.length > limits.integrations) {
        throw invalid();
    }
    const kinds = new Set<string>();
    let versions = 0;
    for (const summary of value) {
        validateSummary(summary, limits);
        if (kinds.has(summary.kind)) {
            throw invalid();
        }
        kinds.add(summary.kind);
        versions += summary.versions.length;
        if (versions > limits.totalVersions) {
            throw invalid();
        }
    }
    return [...value].sort((left, right) => left.kind.localeCompare(right.kind));
}

export async function catalogIndex(
    catalog: IntegrationDefinitionRepository,
    work: BoundedCatalogWork,
    limits: RepositoryCatalogReaderLimits,
    kind: string,
): Promise<IntegrationDefinitionIndex | null> {
    const value = await catalogCall(work, () => catalog.getIndex(kind));
    if (!value) {
        return null;
    }
    validateIndex(value, kind, limits);
    return value;
}

export async function exactDefinition(
    catalog: IntegrationDefinitionRepository,
    work: BoundedCatalogWork,
    kind: string,
    version: string,
): Promise<IntegrationDefinition> {
    const value = await catalogCall(work, () => catalog.get(kind, version));
    if (!value || value.kind !== kind || value.version !== version) {
        throw invalid();
    }
    boundedText(value.label, 1_024);
    if ((value.dependencies?.length ?? 0) > 256 || (value.artifacts?.length ?? 0) > 4_096) {
        throw invalid();
    }
    for (const dependency of value.dependencies ?? []) {
        boundedText(dependency.name, 1_024);
        exactKind(dependency.kind);
        if (dependency.versionRange !== undefined) {
            boundedText(dependency.versionRange, 1_024);
        }
    }
    for (const provider of [
        ...(value.connectors ?? []).map(({ provider }) => provider),
        ...(value.provisions ?? []).map(({ provider }) => provider),
    ]) {
        boundedText(provider, 1_024);
    }
    return value;
}

export function assertSummaryMatchesIndex(
    summary: IntegrationDefinitionSummary,
    index: IntegrationDefinitionIndex,
): void {
    const versions = index.versions.map(({ version }) => version);
    if (
        summary.kind !== index.kind ||
        summary.label !== index.label ||
        summary.schema !== index.schema ||
        !isDeepStrictEqual(summary.icon, index.icon) ||
        summary.category !== index.category ||
        summary.description !== index.description ||
        summary.stable !== index.stable ||
        summary.latest !== index.latest ||
        !sameStrings(summary.versions, versions)
    ) {
        throw invalid();
    }
}

function validateSummary(summary: IntegrationDefinitionSummary, limits: RepositoryCatalogReaderLimits): void {
    exactKind(summary.kind);
    boundedText(summary.label, 1_024);
    if (
        !Array.isArray(summary.versions) ||
        summary.versions.length < 1 ||
        summary.versions.length > limits.versionsPerIntegration
    ) {
        throw invalid();
    }
    assertUniqueVersions(summary.versions);
}

function validateIndex(index: IntegrationDefinitionIndex, expectedKind: string, limits: RepositoryCatalogReaderLimits) {
    exactKind(index.kind);
    if (
        index.kind !== expectedKind ||
        !Array.isArray(index.versions) ||
        index.versions.length < 1 ||
        index.versions.length > limits.versionsPerIntegration
    ) {
        throw invalid();
    }
    boundedText(index.label, 1_024);
    const versions = index.versions.map(({ version }) => version);
    assertUniqueVersions(versions);
    if ((index.stable && !versions.includes(index.stable)) || (index.latest && !versions.includes(index.latest))) {
        throw invalid();
    }
}

function assertUniqueVersions(versions: readonly string[]): void {
    const unique = new Set<string>();
    for (const version of versions) {
        try {
            assertIntegrationPackageVersion(version);
        } catch {
            throw invalid();
        }
        if (unique.has(version)) {
            throw invalid();
        }
        unique.add(version);
    }
}

async function catalogCall<T>(work: BoundedCatalogWork, operation: () => Promise<T>): Promise<T> {
    try {
        return await work.run(operation);
    } catch (error) {
        if (error instanceof IntegrationRepositoryError) {
            throw error;
        }
        throw invalid();
    }
}

function exactKind(value: string): void {
    try {
        assertIntegrationPackageKind(value);
    } catch {
        throw invalid();
    }
}

function boundedText(value: unknown, maxBytes: number): void {
    if (typeof value !== "string" || !value || encoder.encode(value).byteLength > maxBytes) {
        throw invalid();
    }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalid(): IntegrationRepositoryContractError {
    return new IntegrationRepositoryContractError();
}

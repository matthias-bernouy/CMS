import type { ReviewedSchemaBaselineV1 } from "@bernouy/cms-integration-verification";
import type { DeclarativeConnectorTemplate } from "@bernouy/cms-integrations";
import type {
    OfficialRepositoryBootstrapBaselineApproval,
    OfficialRepositoryBootstrapPlanProjection,
} from "../../../../../interfaces/publication";
import type { PreparedFsIntegrationRegistryCandidate } from "../candidate";
import { assertApprovedBootstrapBaseline, assertBootstrapBaselineApproval } from "./approval";
import { resolveBootstrapDependencies } from "./dependencies";

export async function validateBootstrapBaselines(
    plan: OfficialRepositoryBootstrapPlanProjection,
    candidates: readonly PreparedFsIntegrationRegistryCandidate[],
    approval: OfficialRepositoryBootstrapBaselineApproval,
): Promise<void> {
    assertBootstrapBaselineApproval(approval);
    const packagesByKind = new Map(candidates.map((candidate) => [candidate.definition.kind, candidate]));
    const baselinesByKind = new Map<string, ReviewedSchemaBaselineV1>();
    const logicalKeys = new Set<string>();
    for (const baseline of plan.reviewedSchemaBaselines) {
        const candidate = packagesByKind.get(baseline.kind);
        const logicalKey = [
            baseline.kind,
            baseline.version,
            baseline.packageDigest,
            baseline.connectorKey,
            baseline.lineageId,
        ].join("\0");
        if (!candidate || logicalKeys.has(logicalKey) || baselinesByKind.has(baseline.kind)) {
            throw new TypeError("Official bootstrap reviewed schema baseline identity is duplicate or unplanned");
        }
        logicalKeys.add(logicalKey);
        baselinesByKind.set(baseline.kind, baseline);
        assertApprovedBootstrapBaseline(baseline, candidate, approval);
        validateBaselineDependencies(baseline, resolveBootstrapDependencies(candidate, packagesByKind));
    }
    for (const candidate of candidates) {
        const connectors = sqlConnectors(candidate.definition.connectors ?? []);
        if (connectors.length > 1) {
            throw new TypeError("Official bootstrap package has several SQL connectors without stable definition keys");
        }
        const baseline = baselinesByKind.get(candidate.definition.kind);
        if (connectors.length === 1 && !baseline) {
            throw new TypeError(
                `Official bootstrap SQL package requires one reviewed schema baseline: ${candidate.definition.kind}`,
            );
        }
        if (connectors.length === 0 && baseline) {
            throw new TypeError(
                `Official bootstrap reviewed schema baseline targets a package without SQL: ${candidate.definition.kind}`,
            );
        }
        if (baseline && !sameSelector(baseline.legacySelector, connectors[0]!)) {
            throw new TypeError(
                "Official bootstrap reviewed schema baseline selector does not match its SQL connector",
            );
        }
    }
}

function validateBaselineDependencies(
    baseline: ReviewedSchemaBaselineV1,
    dependencies: readonly PreparedFsIntegrationRegistryCandidate[],
): void {
    const expected = dependencies
        .map((candidate) => ({
            kind: candidate.definition.kind,
            version: candidate.package.envelope.version,
            packageDigest: candidate.package.digest,
        }))
        .sort(compareDependencies);
    if (
        baseline.dependencies.length !== expected.length ||
        baseline.dependencies.some((dependency, index) => !sameDependency(dependency, expected[index]))
    ) {
        throw new TypeError("Official bootstrap reviewed schema baseline dependencies differ from the package graph");
    }
}

function sqlConnectors(connectors: readonly DeclarativeConnectorTemplate[]): readonly DeclarativeConnectorTemplate[] {
    return connectors.filter(({ schemas }) => (schemas?.length ?? 0) > 0);
}

function sameSelector(selector: ReviewedSchemaBaselineV1["legacySelector"], connector: DeclarativeConnectorTemplate) {
    return selector.provider === connector.provider && selector.root === connector.root;
}

function sameDependency(
    left: ReviewedSchemaBaselineV1["dependencies"][number],
    right: ReviewedSchemaBaselineV1["dependencies"][number] | undefined,
): boolean {
    return (
        !!right &&
        left.kind === right.kind &&
        left.version === right.version &&
        left.packageDigest === right.packageDigest
    );
}

function compareDependencies(
    left: ReviewedSchemaBaselineV1["dependencies"][number],
    right: ReviewedSchemaBaselineV1["dependencies"][number],
): number {
    return (
        compareText(left.kind, right.kind) ||
        compareText(left.version, right.version) ||
        compareText(left.packageDigest, right.packageDigest)
    );
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

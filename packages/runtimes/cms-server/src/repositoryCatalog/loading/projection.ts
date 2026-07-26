import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import type { RepositoryCompatibilityPageSource, RepositoryCompatibilityReportSource } from "@bernouy/cms-repository";
import type {
    RepositoryCatalogArtifactSummary,
    RepositoryCatalogCompatibilityHistory,
    RepositoryCatalogCompatibilityOutcome,
    RepositoryCatalogCompatibilityReport,
    RepositoryCatalogCompatibilitySummary,
    RepositoryCatalogDocument,
} from "@bernouy/cms-repository/catalog";
import { createHash } from "node:crypto";

export function technicalProviders(definition: IntegrationDefinition): readonly string[] {
    return [
        ...new Set([
            ...(definition.connectors ?? []).map(({ provider }) => provider),
            ...(definition.provisions ?? []).map(({ provider }) => provider),
        ]),
    ].sort((left, right) => left.localeCompare(right));
}

export function artifactSummaries(definition: IntegrationDefinition): readonly RepositoryCatalogArtifactSummary[] {
    const counts = new Map<string, number>();
    for (const artifact of definition.artifacts ?? []) {
        counts.set(artifact.type, (counts.get(artifact.type) ?? 0) + 1);
    }
    return [...counts]
        .map(([type, count]) => ({ type, count }))
        .sort((left, right) => left.type.localeCompare(right.type));
}

export function compatibilityHistory(
    page: RepositoryCompatibilityPageSource,
    revisions: RepositoryCompatibilityPageSource["revisions"],
): RepositoryCatalogCompatibilityHistory {
    return {
        admission: catalogReport(page.admission),
        revisions: revisions.map(catalogReport),
        currentRevisionId: page.current.id,
        warning: page.current.id !== page.admission.id && !page.current.admissible,
    };
}

export function compatibilitySummary(
    history: RepositoryCatalogCompatibilityHistory | undefined,
): RepositoryCatalogCompatibilitySummary | undefined {
    if (!history) {
        return undefined;
    }
    const current = [history.admission, ...(history.revisions ?? [])].find(
        ({ id }) => id === history.currentRevisionId,
    )!;
    return {
        admissionOutcome: history.admission.outcome,
        currentOutcome: current.outcome,
        admissionReportId: history.admission.id,
        currentRevisionId: current.id,
        warning: history.warning,
    };
}

export function catalogDocument<T>(value: T, validators: readonly string[]): RepositoryCatalogDocument<T> {
    const revision = createHash("sha256")
        .update(canonicalJsonBytes({ value, validators: [...validators].sort() }))
        .digest("hex");
    return { value, revision };
}

function catalogReport(source: RepositoryCompatibilityReportSource): RepositoryCatalogCompatibilityReport {
    return {
        id: source.id,
        reportType: source.reportType,
        outcome: source.outcome as RepositoryCatalogCompatibilityOutcome,
        packageDigest: source.packageDigest,
        evaluator: source.evaluator,
        baselines: source.baselines,
        informationalBaselines: source.informationalBaselines,
        createdAt: source.createdAt,
        releaseLevel: source.releaseLevel,
        requiredReleaseLevel: source.requiredReleaseLevel,
        admissible: source.admissible,
        ...(source.reportType === "revision"
            ? {
                  supersedes: source.supersedes,
                  provenance: source.provenance,
              }
            : {}),
        evidence: source.evidence.map((entry) => ({
            classification: entry.classification,
            surface: entry.surface,
            code: entry.code,
            // The public projection intentionally redacts registry-local paths.
            path: entry.code,
            message: entry.message,
        })),
    };
}

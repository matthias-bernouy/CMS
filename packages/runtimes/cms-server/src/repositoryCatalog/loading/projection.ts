import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import type { PublicRepositoryCompatibilityPage, PublicRepositoryCompatibilityReport } from "@bernouy/cms-repository";
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
    page: PublicRepositoryCompatibilityPage,
    revisions: PublicRepositoryCompatibilityPage["revisions"],
): RepositoryCatalogCompatibilityHistory {
    return {
        root: catalogReport(page.root),
        revisions: revisions.map(catalogReport),
        currentReportId: page.current.reportId,
        warning: page.current.reportId !== page.root.reportId && !page.current.contractAdmissible,
    };
}

export function compatibilitySummary(
    history: RepositoryCatalogCompatibilityHistory | undefined,
): RepositoryCatalogCompatibilitySummary | undefined {
    if (!history) {
        return undefined;
    }
    const current = [history.root, ...(history.revisions ?? [])].find(
        ({ reportId }) => reportId === history.currentReportId,
    )!;
    return {
        rootOutcome: history.root.outcome,
        currentOutcome: current.outcome,
        rootReportId: history.root.reportId,
        currentReportId: current.reportId,
        warning: history.warning,
    };
}

export function catalogDocument<T>(value: T, validators: readonly string[]): RepositoryCatalogDocument<T> {
    const revision = createHash("sha256")
        .update(canonicalJsonBytes({ value, validators: [...validators].sort() }))
        .digest("hex");
    return { value, revision };
}

function catalogReport(source: PublicRepositoryCompatibilityReport): RepositoryCatalogCompatibilityReport {
    const report = {
        reportId: source.reportId,
        origin: source.origin,
        outcome: source.outcome as RepositoryCatalogCompatibilityOutcome,
        packageDigest: source.packageDigest,
        evaluator: source.evaluator,
        baselines: source.baselines,
        informationalBaselines: source.informationalBaselines,
        createdAt: source.createdAt,
        releaseLevel: source.releaseLevel,
        requiredReleaseLevel: source.requiredReleaseLevel,
        contractAdmissible: source.contractAdmissible,
        ...(source.noBaselineReason ? { noBaselineReason: source.noBaselineReason } : {}),
        provenance: source.provenance,
        findings: source.findings.map((entry) => ({
            findingId: entry.findingId,
            classification: entry.classification,
            surface: entry.surface,
            code: entry.code,
            message: entry.message,
        })),
    };
    return source.revisionType === "root"
        ? { ...report, revisionType: "root" }
        : { ...report, revisionType: "revision", supersedes: source.supersedes };
}

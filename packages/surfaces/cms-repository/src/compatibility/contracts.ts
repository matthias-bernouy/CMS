export type RepositoryCompatibilityOutcome = "compatible" | "breaking" | "unknown" | "invalid" | "not-applicable";

export type RepositoryCompatibilityPageRequest = Readonly<{
    after?: string;
    limit?: number;
}>;

export type RepositoryCompatibilityEvidenceSource = Readonly<{
    classification: string;
    surface: string;
    code: string;
    message: string;
    path?: unknown;
    source?: unknown;
}>;

export type RepositoryCompatibilityBaselineSource = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
    path?: unknown;
    source?: unknown;
}>;

export type RepositoryCompatibilityReportSource = Readonly<{
    id: string;
    reportType: "admission" | "revision";
    kind: string;
    version: string;
    packageDigest: string;
    evaluator: Readonly<{ name: string; version: string }>;
    createdAt: string;
    baselines: readonly RepositoryCompatibilityBaselineSource[];
    informationalBaselines: readonly RepositoryCompatibilityBaselineSource[];
    evidence: readonly RepositoryCompatibilityEvidenceSource[];
    outcome: string;
    requiredReleaseLevel: string;
    releaseLevel: string;
    admissible: boolean;
    noBaselineReason?: string;
    supersedes?: string;
    provenance?: Readonly<{
        actor?: unknown;
        reason: string;
        evidenceIds?: readonly string[];
        source?: unknown;
        path?: unknown;
    }>;
}>;

export type RepositoryCompatibilityPageSource = Readonly<{
    admission: RepositoryCompatibilityReportSource;
    current: RepositoryCompatibilityReportSource;
    revisions: readonly RepositoryCompatibilityReportSource[];
    totalRevisions: number;
    nextCursor?: string;
}>;

export interface RepositoryCompatibilityReader {
    list(
        kind: string,
        version: string,
        page?: RepositoryCompatibilityPageRequest,
    ): Promise<RepositoryCompatibilityPageSource | null>;
}

export type PublicRepositoryCompatibilityEvidence = Readonly<{
    classification: string;
    surface: string;
    code: string;
    message: string;
}>;

export type PublicRepositoryCompatibilityBaseline = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
}>;

type PublicRepositoryCompatibilityReportBase = Readonly<{
    id: string;
    kind: string;
    version: string;
    packageDigest: string;
    evaluator: Readonly<{ name: string; version: string }>;
    createdAt: string;
    baselines: readonly PublicRepositoryCompatibilityBaseline[];
    informationalBaselines: readonly PublicRepositoryCompatibilityBaseline[];
    evidence: readonly PublicRepositoryCompatibilityEvidence[];
    outcome: RepositoryCompatibilityOutcome;
    requiredReleaseLevel: string;
    releaseLevel: string;
    admissible: boolean;
    noBaselineReason?: string;
}>;

export type PublicRepositoryCompatibilityAdmission = PublicRepositoryCompatibilityReportBase &
    Readonly<{ reportType: "admission" }>;

export type PublicRepositoryCompatibilityRevision = PublicRepositoryCompatibilityReportBase &
    Readonly<{
        reportType: "revision";
        supersedes: string;
        provenance: Readonly<{ reason: string; evidenceIds?: readonly string[] }>;
    }>;

export type PublicRepositoryCompatibilityReport =
    | PublicRepositoryCompatibilityAdmission
    | PublicRepositoryCompatibilityRevision;

export type PublicRepositoryCompatibilityPage = Readonly<{
    admission: PublicRepositoryCompatibilityAdmission;
    current: PublicRepositoryCompatibilityReport;
    revisions: readonly PublicRepositoryCompatibilityRevision[];
    totalRevisions: number;
    nextCursor?: string;
}>;

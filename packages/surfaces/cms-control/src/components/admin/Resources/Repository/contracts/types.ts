import type { RepositoryMetricsView, RepositoryRecentOperationView } from "./observability";

export type RepositoryStatusView = Readonly<{
    ready: boolean;
    health: string;
    integrations: number;
    versions: number;
    diagnostics: number;
    quarantined: number;
    recoveryDiagnostics: number;
    metrics?: RepositoryMetricsView;
}>;

export type RepositoryDiagnosticView = Readonly<{
    code: string;
    message: string;
    stage?: string;
    kind?: string;
    version?: string;
    operationId?: string;
}>;

export type RepositoryQuarantineView = Readonly<{
    kind?: string;
    diagnosticCodes: readonly string[];
}>;

export type RepositoryDiagnosticsView = Readonly<{
    health: string;
    diagnostics: readonly RepositoryDiagnosticView[];
    quarantined: readonly RepositoryQuarantineView[];
    recovery: readonly RepositoryDiagnosticView[];
    metrics?: RepositoryMetricsView;
    recentOperations: readonly RepositoryRecentOperationView[];
}>;

export type RepositoryVersionCompatibilityView = Readonly<{
    rootReportId: string;
    currentReportRevisionId: string;
    currentReportDigest: string;
    outcome: string;
    contractAdmissible: boolean;
    warning: boolean;
}>;

export type RepositoryVersionView = Readonly<{
    version: string;
    digest?: string;
    status?: string;
    blockPreview?: RepositoryChannelRepairPreview;
    release?: Readonly<{
        verificationDigest?: string;
        verificationOrigin?: string;
        verificationOutcome?: string;
        decisionRevisionId?: string;
        decisionDigest?: string;
        admissible: boolean;
    }>;
    compatibility?: RepositoryVersionCompatibilityView;
}>;

export type RepositoryChannelRepairPreview = Readonly<{
    current: Readonly<{ stable?: string; latest?: string }>;
    next: Readonly<{ stable?: string; latest?: string }>;
}>;

export type RepositoryVersionsView = Readonly<{
    kind: string;
    stable?: string;
    latest?: string;
    versions: readonly RepositoryVersionView[];
}>;

export type RepositoryCompatibilityFindingView = Readonly<{
    findingId: string;
    classification: string;
    surface: string;
    code: string;
    message: string;
}>;

export type RepositoryCompatibilityBaselineView = Readonly<{
    kind: string;
    version: string;
    packageDigest: string;
}>;

export type RepositoryCompatibilityReportView = Readonly<{
    reportId: string;
    revisionType: "root" | "revision";
    origin: "admission" | "legacy-backfill";
    kind: string;
    version: string;
    packageDigest: string;
    outcome: string;
    contractAdmissible: boolean;
    evaluator: Readonly<{ name: string; version: string }>;
    createdAt: string;
    releaseLevel: string;
    requiredReleaseLevel: string;
    baselines: readonly RepositoryCompatibilityBaselineView[];
    informationalBaselines: readonly RepositoryCompatibilityBaselineView[];
    findings: readonly RepositoryCompatibilityFindingView[];
    noBaselineReason?: string;
    supersedes?: string;
    provenance: Readonly<{ reason: string; evidenceIds: readonly string[] }>;
}>;

export type RepositoryCompatibilityPageView = Readonly<{
    root: RepositoryCompatibilityReportView;
    current: RepositoryCompatibilityReportView;
    currentRevisionId: string;
    currentReportDigest: string;
    revisions: readonly RepositoryCompatibilityReportView[];
    totalRevisions: number;
    nextCursor?: string;
}>;

export type RepositoryVersionSelection = Readonly<{
    kind: string;
    version: string;
    currentReport: Readonly<{ revisionId: string; reportDigest: string }>;
    status: string;
    decision?: Readonly<{ revisionId: string; digest: string; admissible: boolean }>;
    blockPreview?: RepositoryChannelRepairPreview;
}>;

export type RepositoryReevaluationResultView = Readonly<{
    revision: RepositoryCompatibilityReportView;
    currentReport: Readonly<{ revisionId: string; reportDigest: string }>;
    release?: Readonly<{
        compatibilityReportRevisionId: string;
        decision: Readonly<{ revisionId: string; digest: string }>;
        admissible: boolean;
        eligibilityChanged: boolean;
    }>;
}>;

export type RepositoryPromotionResultView = Readonly<{
    operationId: string;
    kind: string;
    version: string;
    reportRevisionId: string;
    previousStable?: string;
}>;

export type RepositoryVersionBlockResultView = Readonly<{
    operationId: string;
    kind: string;
    version: string;
    nextChannels: Readonly<{ stable?: string; latest?: string }>;
}>;

export type RepositoryActionErrorDetails = Readonly<{
    currentReportRevisionId?: string;
    existingDigest?: string;
    latest?: string;
    reportRevisionId?: string;
    report?: RepositoryCompatibilityReportView;
}>;

import type {
    IntegrationCompatibilityReportPage,
    IntegrationCompatibilityReportPageRequest,
} from "@bernouy/cms-integration-registry";
import type {
    CompatibilityFinding,
    CompatibilityReportV2,
    VersionDigestReference,
} from "@bernouy/cms-integration-verification";

export type RepositoryCompatibilityOutcome = CompatibilityReportV2["outcome"];
export type RepositoryCompatibilityPageRequest = IntegrationCompatibilityReportPageRequest;
export type RepositoryCompatibilityReportSource = CompatibilityReportV2;
export type RepositoryCompatibilityPageSource = IntegrationCompatibilityReportPage;

export interface RepositoryCompatibilityReader {
    list(
        kind: string,
        version: string,
        page?: RepositoryCompatibilityPageRequest,
    ): Promise<RepositoryCompatibilityPageSource | null>;
}

export interface RepositoryProjectedCompatibilityReader {
    list(
        kind: string,
        version: string,
        page?: RepositoryCompatibilityPageRequest,
    ): Promise<PublicRepositoryCompatibilityPage | null>;
}

export type PublicRepositoryCompatibilityFinding = Readonly<
    Pick<CompatibilityFinding, "findingId" | "classification" | "surface" | "code" | "message">
>;

export type PublicRepositoryCompatibilityBaseline = VersionDigestReference;

type PublicRepositoryCompatibilityReportBase = Readonly<{
    reportId: string;
    origin: CompatibilityReportV2["origin"];
    createdAt: string;
    kind: string;
    version: string;
    packageDigest: string;
    evaluator: CompatibilityReportV2["evaluator"];
    baselines: readonly PublicRepositoryCompatibilityBaseline[];
    informationalBaselines: readonly PublicRepositoryCompatibilityBaseline[];
    findings: readonly PublicRepositoryCompatibilityFinding[];
    outcome: CompatibilityReportV2["outcome"];
    requiredReleaseLevel: CompatibilityReportV2["requiredReleaseLevel"];
    releaseLevel: CompatibilityReportV2["releaseLevel"];
    contractAdmissible: boolean;
    noBaselineReason?: CompatibilityReportV2["noBaselineReason"];
    provenance: Readonly<{ reason: string; evidenceIds?: readonly string[] }>;
}>;

export type PublicRepositoryCompatibilityRoot = PublicRepositoryCompatibilityReportBase &
    Readonly<{ revisionType: "root" }>;

export type PublicRepositoryCompatibilityRevision = PublicRepositoryCompatibilityReportBase &
    Readonly<{ revisionType: "revision"; supersedes: string }>;

export type PublicRepositoryCompatibilityReport =
    | PublicRepositoryCompatibilityRoot
    | PublicRepositoryCompatibilityRevision;

export type PublicRepositoryCompatibilityPage = Readonly<{
    root: PublicRepositoryCompatibilityRoot;
    current: PublicRepositoryCompatibilityReport;
    revisions: readonly PublicRepositoryCompatibilityRevision[];
    totalRevisions: number;
    nextCursor?: string;
}>;

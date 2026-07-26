/**
 * @bernouy/cms-repository — read-only HTTP repository surface.
 */

export { RepositoryCms } from "cms-repository/RepositoryCms";
export type { RepositoryCmsConfig } from "cms-repository/RepositoryCms";
export type {
    PublicPackageDownloadProtection,
    PublicPackageReadBudget,
    PublicPackageReadObservation,
} from "cms-repository/packageDownloadGuard";
export type {
    PublicRepositoryCompatibilityAdmission,
    PublicRepositoryCompatibilityBaseline,
    PublicRepositoryCompatibilityEvidence,
    PublicRepositoryCompatibilityPage,
    PublicRepositoryCompatibilityReport,
    PublicRepositoryCompatibilityRevision,
    RepositoryCompatibilityBaselineSource,
    RepositoryCompatibilityEvidenceSource,
    RepositoryCompatibilityOutcome,
    RepositoryCompatibilityPageRequest,
    RepositoryCompatibilityPageSource,
    RepositoryCompatibilityReader,
    RepositoryCompatibilityReportSource,
} from "cms-repository/compatibility/contracts";

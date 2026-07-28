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
    PublicRepositoryReadObservation,
    PublicRepositoryReadObserver,
    PublicRepositoryReadResource,
} from "cms-repository/readObservation";
export type {
    PublicRepositoryCompatibilityBaseline,
    PublicRepositoryCompatibilityFinding,
    PublicRepositoryCompatibilityPage,
    PublicRepositoryCompatibilityReport,
    PublicRepositoryCompatibilityRoot,
    PublicRepositoryCompatibilityRevision,
    RepositoryCompatibilityOutcome,
    RepositoryCompatibilityPageRequest,
    RepositoryCompatibilityPageSource,
    RepositoryCompatibilityReader,
    RepositoryProjectedCompatibilityReader,
    RepositoryCompatibilityReportSource,
} from "cms-repository/compatibility/contracts";
export type {
    PublicRepositoryMigrationEvidence,
    PublicRepositoryRelease,
    RepositoryProjectedReleaseReader,
    RepositoryReleaseReader,
    RepositoryVerificationBundleReader,
} from "cms-repository/compatibility/releaseContracts";

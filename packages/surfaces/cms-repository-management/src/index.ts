/**
 * @bernouy/cms-repository-management — authenticated repository management
 * HTTP boundary.
 */

export {
    createRepositoryMaintenanceGuard,
    createRepositoryManagementGuard,
    type RepositoryManagementGuardConfig,
} from "cms-repository-management/managementGuard";
export {
    type IntegrationPackageUpload,
    type IntegrationPackageUploadOptions,
    readIntegrationPackageUpload,
} from "cms-repository-management/packageUpload";
export {
    IntegrationPackageUploadError,
    type IntegrationPackageUploadErrorCode,
    integrationPackageUploadErrorResponse,
} from "cms-repository-management/packageUploadError";
export {
    RepositoryManagementCms,
    type RepositoryManagementCmsConfig,
    REPOSITORY_PUBLICATION_PATH,
} from "cms-repository-management/RepositoryManagementCms";
export {
    mountRepositoryManagementReadRoutes,
    REPOSITORY_COMPATIBILITY_PATH,
    REPOSITORY_DIAGNOSTICS_PATH,
    REPOSITORY_STATUS_PATH,
    REPOSITORY_RELEASE_PATH,
    REPOSITORY_VERSIONS_PATH,
    type RepositoryManagementReadConfig,
} from "cms-repository-management/operations/readRoutes";
export {
    mountRepositoryStablePromotionRoutes,
    REPOSITORY_STABLE_PROMOTIONS_PATH,
    type RepositoryStablePromotionRoutesConfig,
} from "cms-repository-management/operations/promotionRoutes";
export {
    mountRepositoryVersionEligibilityRoutes,
    REPOSITORY_VERSION_BLOCKS_PATH,
    type RepositoryVersionEligibilityRoutesConfig,
} from "cms-repository-management/operations/versionEligibilityRoutes";
export {
    mountRepositoryCompatibilityReevaluationRoutes,
    REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH,
    type RepositoryCompatibilityReevaluationRoutesConfig,
} from "cms-repository-management/operations/reevaluationRoutes";
export {
    mountRepositorySchemaBaselineImportRoutes,
    REPOSITORY_SCHEMA_BASELINE_IMPORT_PATH,
    type RepositorySchemaBaselineImportRoutesConfig,
} from "cms-repository-management/operations/maintenance/schemaBaselineImportRoutes";
export {
    mountRepositoryVerificationBackfillRoutes,
    REPOSITORY_VERIFICATION_BACKFILL_PATH,
    type RepositoryVerificationBackfillRoutesConfig,
} from "cms-repository-management/operations/maintenance/verificationBackfillRoutes";
export {
    createRepositoryWorkerGuard,
    type RepositoryWorkerGuardConfig,
} from "cms-repository-management/operations/candidates/auth";
export { createRepositoryCandidateCapabilityAuthority } from "cms-repository-management/operations/candidates/capability";
export {
    createRepositoryCandidateAdmissionCoordinator,
    RepositoryCandidateAdmissionPlanningError,
} from "cms-repository-management/operations/candidates/coordinator";
export {
    REPOSITORY_CANDIDATES_PATH,
    REPOSITORY_CANDIDATE_STATUS_PATH,
    REPOSITORY_VERIFICATION_JOBS_PATH,
    REPOSITORY_VERIFICATION_JOB_CLAIMS_PATH,
    REPOSITORY_VERIFICATION_JOB_LEASE_PATH,
    REPOSITORY_VERIFICATION_JOB_RESULT_CAPABILITIES_PATH,
    REPOSITORY_VERIFICATION_JOB_RESULT_PATH,
    type RepositoryCandidateCapabilityAuthority,
    type RepositoryCandidateCapabilityIdentity,
    type RepositoryCandidateAdmissionCoordinator,
    type RepositoryCandidateAdmissionPlan,
    type RepositoryCandidateAdmissionPlanner,
    type RepositoryCandidateAuthorSuiteResolver,
    type RepositoryCandidatePublicationFinalizer,
    type RepositoryCandidateManagementRoutesConfig,
    type RepositoryCandidateWorkerRoutesConfig,
    type RepositoryCandidateWorkerSurfaceMount,
} from "cms-repository-management/operations/candidates/contracts";
export { mountRepositoryCandidateManagementRoutes } from "cms-repository-management/operations/candidates/managementRoutes";
export {
    mountRepositoryCandidateAuthenticatedWorkerRoutes,
    mountRepositoryCandidateCapabilityRoutes,
    mountRepositoryCandidateWorkerRoutes,
} from "cms-repository-management/operations/candidates/worker";

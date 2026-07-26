/**
 * @bernouy/cms-repository-management — authenticated repository management
 * HTTP boundary.
 */

export {
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
    REPOSITORY_VERSIONS_PATH,
    type RepositoryManagementReadConfig,
} from "cms-repository-management/operations/readRoutes";

/**
 * @bernouy/cms-integrations — integration definitions and import execution.
 *
 * Surfaces mount HTTP routes and inject persistence dependencies. This package
 * owns the declarative registry, DTO parsing, and source/secret imports.
 */

export type {
    DeclarativeArtifactTemplate,
    DeclarativeBlocArtifactTemplate,
    DeclarativeDashboardArtifactTemplate,
    IntegrationAnswerValue,
    DeclarativeDashboardRelationProjectionArtifactTemplate,
    DeclarativeConnectorCompatibility,
    DeclarativeConnectorFunctionCompatibility,
    DeclarativeConnectorFunctionHttpContract,
    DeclarativeConnectorFunctionHttpDataShape,
    DeclarativeConnectorFunctionHttpEndpointContract,
    DeclarativeConnectorFunctionHttpResponseContract,
    DeclarativeConnectorFunctionHttpStringFormat,
    DeclarativeConnectorFunctionTemplate,
    DeclarativeConnectorSchemaColumnContract,
    DeclarativeConnectorSchemaConstraintContract,
    DeclarativeConnectorSchemaContract,
    DeclarativeConnectorSchemaForeignKeyAction,
    DeclarativeConnectorSchemaNamespaceContract,
    DeclarativeConnectorSchemaRelationContract,
    DeclarativeConnectorSchemaRelationKind,
    DeclarativeConnectorSchemaTemplate,
    DeclarativeConnectorTemplate,
    DeclarativeProvisionOutputTemplate,
    DeclarativeProvisionTemplate,
    DeclarativeAfterInstallationTemplate,
    DeclarativeFunctionArtifactTemplate,
    DeclarativeGeneratedSecretTemplate,
    DeclarativeRelationArtifactTemplate,
    DeclarativeSecretTemplate,
    DeclarativeSourceArtifactTemplate,
    DeclarativeSourceOverlayArtifactTemplate,
    DeclarativeTriggerArtifactTemplate,
    IntegrationCspPolicy,
    IntegrationDefinition,
    IntegrationDependency,
    IntegrationIcon,
    IntegrationInput,
    IntegrationSecurityDefinition,
    IntegrationUiDefinition,
} from "../interfaces/Integration";
export {
    OBSERVED_SCHEMA_CONTRACT_V1,
    type ObservedSchemaColumnV1,
    type ObservedSchemaConstraintV1,
    type ObservedSchemaContractIdentity,
    type ObservedSchemaContractV1,
    type ObservedSchemaNamespaceV1,
    type ObservedSchemaOwnerV1,
    type ObservedSchemaRelationV1,
} from "../interfaces/Integration";
export type {
    IntegrationConnectorDeployer,
    IntegrationConnectorDeployContext,
    IntegrationConnectorDeployment,
    IntegrationConnectorDeployResult,
    IntegrationConnectorFunctionDeployment,
    IntegrationPackageResolutionReason,
    IntegrationPackageResolver,
    IntegrationConnectorResourceResult,
    IntegrationConnectorSchemaDeployment,
    ResolveIntegrationPackageRequest,
    ResolvedIntegrationPackageRoot,
} from "../interfaces/IntegrationConnectorDeployer";
export {
    SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY,
    type IntegrationConnectorProvider,
    type IntegrationConnectorProviderRepository,
} from "../interfaces/IntegrationConnectorProvider";
export type {
    IntegrationArtifactAction,
    IntegrationArtifactResult,
    IntegrationArtifactType,
    IntegrationBlocArtifact,
    IntegrationBlocImporter,
    IntegrationImportDeps,
    IntegrationImportDto,
    IntegrationImportOptions,
    IntegrationImportRequest,
    IntegrationImportResult,
    IntegrationProvisionContext,
    IntegrationProvisionDeployment,
    IntegrationProvisionExecutionResult,
    IntegrationProvisioner,
    IntegrationProvisionOutput,
    IntegrationProvisionResourceResult,
    IntegrationProvisionResult,
    IntegrationSecretResult,
} from "../interfaces/IntegrationImport";
export type {
    IntegrationInstallation,
    IntegrationInstallationStatus,
    IntegrationRun,
    IntegrationRunError,
} from "../interfaces/IntegrationInstallation";
export type {
    IntegrationInstallationCreate,
    IntegrationInstallationRepository,
} from "../interfaces/IntegrationInstallationRepository";
export type {
    IntegrationAsset,
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../interfaces/IntegrationDefinitionRepository";

export {
    DuplicateIntegrationInstallationError,
    IntegrationInputError,
    IntegrationRepositoryContractError,
    IntegrationRepositoryError,
    IntegrationRepositoryUnavailableError,
    IntegrationRuntimeError,
    MissingIntegrationPackageError,
    MissingIntegrationInstallationError,
    MissingIntegrationParam,
} from "../core/errors";
export {
    findIntegration,
    integrationRegistry,
} from "../core/definitions/catalog";
export {
    assertExactIntegrationVersion,
    assertSupportedIntegrationVersionRange,
    integrationVersionRangeContainsRange,
    integrationVersionReleaseLevel,
    integrationVersionSatisfies,
    integrationVersionsShareMajor,
    isExactIntegrationVersion,
    isIntegrationPrerelease,
    isSupportedIntegrationVersionRange,
    type IntegrationVersionReleaseLevel,
} from "../core/definitions/versioning";
export {
    parseIntegrationImportRequest,
    parseIntegrationImportDto,
} from "../core/parsing/parseIntegrationImportDto";
export { parseIntegrationDefinition } from "../core/parsing/definition/definition";
export {
    parseConnectorFunctionHttpDataShape,
    parseConnectorSchemaContract,
    canonicalObservedSchemaContractBytes,
    identifyObservedSchemaContract,
    parseObservedSchemaContractV1,
    projectObservedSchemaContract,
    sameObservedSchemaContract,
} from "../core/parsing/templates/connector-compatibility";
export { assertSqlConnectorSchemaCompatibilityDeclared } from "../core/definitions/connectorCompatibility";
export { importIntegration } from "../core/importIntegration";
export {
    integrationInstallationId,
    runIntegrationInstallation,
    type RunIntegrationInstallationCreateRequest,
    type RunIntegrationInstallationRerunRequest,
    type RunIntegrationInstallationUpgradeRequest,
} from "../core/installation/execution/runIntegrationInstallation";
export { assertResolvedRerunDefinition, assertRerunVersion } from "../core/installation/execution/rerunRequest";
export {
    resolveTemplate,
    resolveTemplates,
    type TemplateContext,
} from "../core/definitions/templates";
export {
    collectIntegrationDefinitionCspExtras,
    collectIntegrationInstallationCspExtras,
    emptyIntegrationCspExtras,
    type IntegrationCspExtras,
} from "../core/security/csp";
export { InMemoryIntegrationInstallationRepository } from "../default-implementation/installations/InMemoryIntegrationInstallationRepository";
export { InMemoryIntegrationConnectorProviderRepository } from "../default-implementation/connector-providers/InMemoryIntegrationConnectorProviderRepository";

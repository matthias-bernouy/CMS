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
    DeclarativeConnectorDatabaseClockDefaultProjection,
    DeclarativeConnectorInstallBaseline,
    DeclarativeConnectorLegacyAdoptionBaseline,
    DeclarativeConnectorMigrationDescriptor,
    DeclarativeConnectorMigrationEquivalence,
    DeclarativeConnectorMigrationPlan,
    DeclarativeConnectorMigrationReference,
    DeclarativeConnectorMigrationSource,
    DeclarativeConnectorRepeatableDescriptor,
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
    IntegrationInputOption,
    IntegrationObjectListField,
    IntegrationObjectListInput,
    IntegrationCmsMediatedCutover,
    IntegrationMigrationChecksum,
    IntegrationMigrationHttpSmoke,
    IntegrationProviderDirectCutover,
    IntegrationSecurityDefinition,
    IntegrationThemeCategory,
    IntegrationThemeDefinition,
    IntegrationThemeToken,
    IntegrationThemeTokenDefaults,
    IntegrationThemeTokenType,
    IntegrationUiDefinition,
    IntegrationValueInput,
} from "../interfaces/Integration";
export {
    MAX_INTEGRATION_MIGRATION_SMOKE_BODY_BYTES,
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
    IntegrationConnectorMigrationDeployment,
    IntegrationConnectorMigrationIdentity,
    IntegrationConnectorMigrationAdapter,
    IntegrationConnectorBaselineAdopter,
    IntegrationConnectorBaselineAdoptionContext,
    IntegrationMigrationConnectorTransition,
    IntegrationMigrationExternalPhaseHandler,
    IntegrationMigrationProbe,
    IntegrationMigrationPhase,
    IntegrationMigrationRuntime,
    IntegrationMigrationStepConfirmation,
    IntegrationMigrationStepCompensation,
    IntegrationMigrationStepContext,
    IntegrationMigrationStepResult,
    IntegrationProviderDirectMigrationAdapter,
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
    IntegrationBlocImportContext,
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
    IntegrationPublishedPageResolver,
    IntegrationResolvedPage,
    IntegrationSecretResult,
} from "../interfaces/IntegrationImport";
export type {
    IntegrationInstallation,
    IntegrationInstallationStatus,
    IntegrationConnectorBinding,
    IntegrationConnectorBaselineAdoptionAudit,
    IntegrationMigrationCompensationJournal,
    IntegrationMigrationJournalEntry,
    IntegrationMigrationJournalStatus,
    IntegrationMigrationOperation,
    IntegrationMigrationOperationStatus,
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
export { collectIntegrationInstallationThemeContributions } from "../core/definitions/themeContributions";
export { sameConnectorMigrationReferences } from "../core/definitions/migrationReferences";
export {
    assertIntegrationVersionInstallable,
    assertUpgradeEligible,
    isIntegrationDefinitionVersionInstallable,
    resolveExactIntegrationDefinitionVersion,
    resolveInstallableIntegrationDefinitionVersion,
} from "../core/definitions/repositoryVersions";
export {
    assertExactIntegrationVersion,
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
export {
    abortIntegrationMigration,
    ambiguousMigrationReconciliationRetryConfirmation,
    retryAmbiguousMigrationReconciliation,
    runDurableMigrationUpgrade,
    type AbortIntegrationMigrationRequest,
    type DurableMigrationUpgradeRequest,
    type RetryAmbiguousMigrationReconciliationRequest,
} from "../core/installation/migration/engine";
export {
    adoptLegacyConnectorBaseline,
    legacyBaselineAdoptionConfirmation,
    type AdoptLegacyConnectorBaselineRequest,
} from "../core/installation/migration/adoption/service";
export {
    ProductionIntegrationMigrationRuntime,
    type ProductionIntegrationMigrationRuntimeOptions,
} from "../core/installation/migration/runtime";
export { CmsSourceBindingMigrationHandler } from "../core/installation/migration/runtime/cmsBinding";
export { CmsSourceFunctionalMigrationProbe } from "../core/installation/migration/runtime/functionalSmoke";
export { ProviderDirectMigrationHandler } from "../core/installation/migration/runtime/providerDirect";
export { assertResolvedRerunDefinition, assertRerunVersion } from "../core/installation/execution/ordinary/request";
export {
    abandonPendingIntegrationOperation,
    legacyPendingIntegrationOperationAbandonmentConfirmation,
    pendingIntegrationOperationAbandonmentConfirmation,
    type AbandonPendingIntegrationOperationRequest,
} from "../core/installation/execution/ordinary/abandonment";
export { resolveUpgradePackage } from "../core/installation/packages";
export {
    resolveTemplate,
    resolveTemplates,
    type TemplateContext,
} from "../core/definitions/templating/templates";
export {
    collectIntegrationDefinitionCspExtras,
    collectIntegrationInstallationCspExtras,
    emptyIntegrationCspExtras,
    type IntegrationCspExtras,
} from "../core/security/csp";
export { InMemoryIntegrationInstallationRepository } from "../default-implementation/installations/InMemoryIntegrationInstallationRepository";
export { InMemoryIntegrationConnectorProviderRepository } from "../default-implementation/connector-providers/InMemoryIntegrationConnectorProviderRepository";

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
    DeclarativeConnectorFunctionTemplate,
    DeclarativeConnectorSchemaTemplate,
    DeclarativeConnectorTemplate,
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
export type {
    IntegrationConnectorDeployer,
    IntegrationConnectorDeployContext,
    IntegrationConnectorDeployment,
    IntegrationConnectorDeployResult,
    IntegrationConnectorFunctionDeployment,
    IntegrationConnectorResourceResult,
    IntegrationConnectorSchemaDeployment,
} from "../interfaces/IntegrationConnectorDeployer";
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
    IntegrationRuntimeError,
    MissingIntegrationInstallationError,
    MissingIntegrationParam,
} from "../core/errors";
export {
    findIntegration,
    integrationRegistry,
} from "../core/catalog";
export {
    parseIntegrationImportRequest,
    parseIntegrationImportDto,
} from "../core/parsing/parseIntegrationImportDto";
export {
    parseIntegrationDefinition,
} from "../core/parsing/definition";
export {
    importIntegration,
} from "../core/importIntegration";
export {
    integrationInstallationId,
    runIntegrationInstallation,
    type RunIntegrationInstallationCreateRequest,
    type RunIntegrationInstallationRerunRequest,
} from "../core/installation/runIntegrationInstallation";
export {
    resolveTemplate,
    resolveTemplates,
    type TemplateContext,
} from "../core/templates";
export {
    collectIntegrationDefinitionCspExtras,
    collectIntegrationInstallationCspExtras,
    emptyIntegrationCspExtras,
    type IntegrationCspExtras,
} from "../core/security/csp";
export {
    InMemoryIntegrationInstallationRepository,
} from "../default-implementation/InMemoryIntegrationInstallationRepository";

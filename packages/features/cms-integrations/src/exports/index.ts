/**
 * @bernouy/cms-integrations — integration definitions and import execution.
 *
 * Surfaces mount HTTP routes and inject persistence dependencies. This package
 * owns the declarative registry, DTO parsing, and source/secret imports.
 */

export type {
    IntegrationAnswerValue,
    IntegrationCspPolicy,
    IntegrationDefinition,
    IntegrationInput,
    IntegrationSecurityDefinition,
    IntegrationUiDefinition,
} from "../interfaces/Integration";
export type {
    IntegrationArtifactAction,
    IntegrationArtifactResult,
    IntegrationArtifactType,
    IntegrationBlocArtifact,
    IntegrationBlocImporter,
    IntegrationImportDeps,
    IntegrationImportDto,
    IntegrationImportInstanceInput,
    IntegrationImportOptions,
    IntegrationImportRequest,
    IntegrationImportResult,
    IntegrationSecretResult,
} from "../interfaces/IntegrationImport";
export type {
    IntegrationInstance,
    IntegrationInstanceStatus,
    IntegrationRun,
    IntegrationRunError,
} from "../interfaces/IntegrationInstance";
export type {
    IntegrationInstanceCreate,
    IntegrationInstanceRepository,
} from "../interfaces/IntegrationInstanceRepository";
export type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
    IntegrationDefinitionSummary,
    IntegrationDefinitionVersion,
} from "../interfaces/IntegrationDefinitionRepository";

export {
    DuplicateIntegrationInstanceError,
    IntegrationInputError,
    IntegrationRuntimeError,
    MissingIntegrationInstanceError,
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
    createIntegrationInstanceId,
    runIntegrationInstance,
    type RunIntegrationInstanceCreateRequest,
    type RunIntegrationInstanceRerunRequest,
} from "../core/instance/runIntegrationInstance";
export {
    resolveTemplate,
    resolveTemplates,
    type TemplateContext,
} from "../core/templates";
export {
    collectIntegrationDefinitionCspExtras,
    collectIntegrationInstanceCspExtras,
    emptyIntegrationCspExtras,
    type IntegrationCspExtras,
} from "../core/security/csp";
export {
    InMemoryIntegrationInstanceRepository,
} from "../default-implementation/InMemoryIntegrationInstanceRepository";

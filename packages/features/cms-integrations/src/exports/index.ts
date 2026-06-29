/**
 * @bernouy/cms-integrations — integration definitions and import execution.
 *
 * Surfaces mount HTTP routes and inject persistence dependencies. This package
 * owns the declarative registry, DTO parsing, and source/secret imports.
 */

export type {
    IntegrationAnswerValue,
    IntegrationDefinition,
    IntegrationInput,
    IntegrationUiDefinition,
} from "../interfaces/Integration";
export type {
    IntegrationArtifactAction,
    IntegrationArtifactResult,
    IntegrationArtifactType,
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

export {
    DuplicateIntegrationInstanceError,
    IntegrationInputError,
    IntegrationRuntimeError,
    MissingIntegrationInstanceError,
    MissingIntegrationParam,
} from "../core/errors";
export {
    BUILT_IN_INTEGRATIONS,
    BAN_INTEGRATION,
    STRIPE_INTEGRATION,
} from "../built-in";
export {
    findIntegration,
    integrationRegistry,
} from "../core/catalog";
export {
    parseIntegrationImportRequest,
    parseIntegrationImportDto,
} from "../core/parsing/parseIntegrationImportDto";
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
    InMemoryIntegrationInstanceRepository,
} from "../default-implementation/InMemoryIntegrationInstanceRepository";

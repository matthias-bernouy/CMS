import { parseManagement, parseExtension, validateManagement } from "./metadata/management";
import { IntegrationInputError, MissingIntegrationParam } from "../../errors";
import { isExactIntegrationVersion } from "../../definitions/versioning";
import {
    assertPasswordInputsDeclareSecrets,
    assertSecretInputsUseStringValues,
    sensitiveInputNames,
} from "../../shared/inputSensitivity";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import { parseArtifactTemplates } from "../templates/sourceTemplates";
import { parseAfterInstallationTemplates, validateAfterInstallationTemplates } from "./afterInstallation";
import { parseConnectorTemplates, validateConnectorDefinition } from "../templates/connectorTemplates";
import { parseProvisionTemplates, validateProvisionDefinition } from "../templates/provisionTemplates";
import { parseDependencies, validateDependencies } from "./dependencies";
import { parseIntegrationIcon } from "./icon";
import { assertUniqueInputs, parseInput, validateInputDefinition } from "./inputDefinitions";
import {
    assertUniqueSecretBindingNames,
    parseGeneratedSecretTemplates,
    parseSecretTemplates,
    validateGeneratedSecretDefinition,
} from "../templates/secretTemplates";
import { parseSecurityDefinition, validateSecurityDefinition } from "./metadata/securityDefinition";
import { parseThemeDefinition, validateThemeDefinition } from "./metadata/themeDefinition";
import { parseUiDefinition } from "./metadata/uiDefinition";
import { isRecord, parseJsonAnswer, text } from "./values";
import {
    INTEGRATION_DEFINITION_SCHEMA_V1,
    INTEGRATION_DEFINITION_SCHEMA_V2,
} from "../../../interfaces/IntegrationResources";
import { parseCollectionCategories, parseCollectionResources } from "./resources";

export function assertDefinitionUsable(definition: IntegrationDefinition): void {
    validateDefinitionModel(definition);
    validateManagement(definition);
    assertUniqueInputs(definition.inputs);
    assertSecretInputsUseStringValues(definition);
    assertPasswordInputsDeclareSecrets(definition);
    validateDependencies(definition);
    for (const input of definition.inputs) {
        validateInputDefinition(input);
    }
    const secretInputs = new Set(sensitiveInputNames(definition));
    for (const secret of definition.secrets ?? []) {
        if (!secretInputs.has(secret.input)) {
            throw new IntegrationInputError(`definition.secrets.${secret.input}`, "must reference a secret input");
        }
    }
    assertUniqueSecretBindingNames(definition.secrets ?? [], definition.generatedSecrets ?? []);
    for (const secret of definition.generatedSecrets ?? []) {
        validateGeneratedSecretDefinition(secret);
    }
    for (const connector of definition.connectors ?? []) {
        validateConnectorDefinition(connector);
    }
    for (const provision of definition.provisions ?? []) {
        validateProvisionDefinition(provision);
    }
    validateAfterInstallationTemplates(definition.afterInstallation ?? [], definition.dependencies ?? []);
    if (definition.security) {
        validateSecurityDefinition(definition.security);
    }
    if (definition.theme) {
        validateThemeDefinition(definition.theme, definition.kind);
    }
}

export function parseOptionalDefinition(value: unknown): IntegrationDefinition | undefined {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    const parsed = parseJsonAnswer(value, "definition");
    return parseIntegrationDefinition(parsed);
}

export function parseIntegrationDefinition(value: unknown): IntegrationDefinition {
    if (!isRecord(value)) {
        throw new IntegrationInputError("definition", "must be an object");
    }
    return parseDefinition(value);
}

function parseDefinition(value: Record<string, unknown>): IntegrationDefinition {
    const schema = parseSchema(value.schema);
    const type = parseDefinitionType(value.type, schema);
    const kind = text(value.kind);
    if (!kind) {
        throw new MissingIntegrationParam("definition.kind");
    }
    const label = text(value.label);
    if (!label) {
        throw new MissingIntegrationParam("definition.label");
    }
    if (value.inputs !== undefined && !Array.isArray(value.inputs)) {
        throw new IntegrationInputError("definition.inputs", "must be an array");
    }

    const inputs = (Array.isArray(value.inputs) ? value.inputs : []).map((input, index) =>
        parseInput(input, `definition.inputs.${index}`),
    );
    assertUniqueInputs(inputs);
    const parsedDefinition = { kind, label, inputs };
    assertSecretInputsUseStringValues(parsedDefinition);
    assertPasswordInputsDeclareSecrets(parsedDefinition);
    const secrets = parseSecretTemplates(value.secrets, new Set(sensitiveInputNames(parsedDefinition)));
    const generatedSecrets = parseGeneratedSecretTemplates(value.generatedSecrets);
    assertUniqueSecretBindingNames(secrets, generatedSecrets);
    const version = text(value.version);
    if (version && !isExactIntegrationVersion(version)) {
        throw new IntegrationInputError("definition.version", "must be an exact SemVer version");
    }
    const connectors = parseConnectorTemplates(value.connectors, version);
    for (const connector of connectors) {
        validateConnectorDefinition(connector);
    }
    const connectorKeys = connectors.flatMap((connector) => (connector.connectorKey ? [connector.connectorKey] : []));
    if (new Set(connectorKeys).size !== connectorKeys.length) {
        throw new IntegrationInputError("definition.connectors", "must use unique connectorKey values");
    }
    const provisions = parseProvisionTemplates(value.provisions);
    const afterInstallation = parseAfterInstallationTemplates(value.afterInstallation);
    const artifacts = parseArtifactTemplates(value.artifacts, schema !== INTEGRATION_DEFINITION_SCHEMA_V2);
    const dependencies = parseDependencies(value.dependencies, kind);
    validateAfterInstallationTemplates(afterInstallation, dependencies);
    const icon = parseIntegrationIcon(value.icon);
    const ui = parseUiDefinition(value.ui);
    const theme = parseThemeDefinition(value.theme, kind);
    const security = parseSecurityDefinition(value.security);

    const management = parseManagement(value.management);
    const extensionOf = parseExtension(value.extensionOf);
    const base = {
        ...(management ? { management } : {}),
        ...(extensionOf ? { extensionOf } : {}),
        kind,
        label,
        ...(version ? { version } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(icon ? { icon } : {}),
        inputs,
        ...(secrets.length ? { secrets } : {}),
        ...(generatedSecrets.length ? { generatedSecrets } : {}),
        ...(connectors.length ? { connectors } : {}),
        ...(provisions.length ? { provisions } : {}),
        ...(afterInstallation.length ? { afterInstallation } : {}),
        ...(artifacts.length ? { artifacts } : {}),
        ...(ui ? { ui } : {}),
        ...(theme ? { theme } : {}),
        ...(security ? { security } : {}),
        ...(dependencies.length ? { dependencies } : {}),
    };
    if (schema === INTEGRATION_DEFINITION_SCHEMA_V2 && type === "source") {
        const definition: IntegrationDefinition = {
            ...base,
            schema,
            type,
            artifacts: artifacts.filter(
                (
                    artifact,
                ): artifact is Exclude<typeof artifact, { type: "bloc" | "dashboard" | "dashboardRelation" }> =>
                    artifact.type !== "bloc" && artifact.type !== "dashboard" && artifact.type !== "dashboardRelation",
            ),
        };
        validateDefinitionModel(definition, artifacts);
        validateManagement(definition);
        return definition;
    }
    if (schema === INTEGRATION_DEFINITION_SCHEMA_V2 && type === "collection") {
        const definition: IntegrationDefinition = {
            ...base,
            schema,
            type,
            artifacts: artifacts.filter(
                (artifact): artifact is Extract<typeof artifact, { type: "bloc" }> => artifact.type === "bloc",
            ),
            resourceCategories: parseCollectionCategories(value.resourceCategories),
            resources: parseCollectionResources(value.resources, kind),
        };
        validateDefinitionModel(definition, artifacts);
        validateManagement(definition);
        return definition;
    }
    return {
        ...base,
        ...(schema === INTEGRATION_DEFINITION_SCHEMA_V1 ? { schema } : {}),
        ...(artifacts.length ? { artifacts } : {}),
    };
}

function parseSchema(value: unknown): IntegrationDefinition["schema"] {
    if (value === undefined) {
        return undefined;
    }
    if (value === INTEGRATION_DEFINITION_SCHEMA_V1 || value === INTEGRATION_DEFINITION_SCHEMA_V2) {
        return value;
    }
    throw new IntegrationInputError("definition.schema", "must be cms.integration.definition.v1 or v2");
}

function parseDefinitionType(
    value: unknown,
    schema: IntegrationDefinition["schema"],
): "source" | "collection" | undefined {
    if (schema !== INTEGRATION_DEFINITION_SCHEMA_V2) {
        if (value !== undefined) {
            throw new IntegrationInputError("definition.type", "is supported only by cms.integration.definition.v2");
        }
        return undefined;
    }
    if (value !== "source" && value !== "collection") {
        throw new IntegrationInputError("definition.type", "must be source or collection");
    }
    return value;
}

function validateDefinitionModel(
    definition: IntegrationDefinition,
    parsedArtifacts: readonly NonNullable<IntegrationDefinition["artifacts"]>[number][] = definition.artifacts ?? [],
): void {
    if (definition.schema !== INTEGRATION_DEFINITION_SCHEMA_V2) {
        return;
    }
    if (
        definition.extensionOf &&
        (definition.extensionOf.kind === definition.kind ||
            !definition.dependencies?.some(({ kind }) => kind === definition.extensionOf?.kind))
    ) {
        throw new IntegrationInputError("definition.extensionOf", "must reference a distinct declared dependency");
    }
    if (definition.type === "source") {
        const forbidden = parsedArtifacts.filter(
            (artifact) =>
                artifact.type === "bloc" || artifact.type === "dashboard" || artifact.type === "dashboardRelation",
        );
        if (forbidden.length) {
            throw new IntegrationInputError(
                "definition.artifacts",
                "source integrations cannot publish blocs or dashboards",
            );
        }
        for (const artifact of definition.artifacts ?? []) {
            if (artifact.type === "source" && artifact.source.endpoints.some((endpoint) => !endpoint.contractVersion)) {
                throw new IntegrationInputError(
                    "definition.artifacts",
                    `source "${artifact.source.id}" must version every endpoint contract`,
                );
            }
            if (artifact.type === "function" && !artifact.contractVersion) {
                throw new IntegrationInputError(
                    "definition.artifacts",
                    `function "${artifact.function.id}" must declare a contract version`,
                );
            }
        }
        if (definition.theme) {
            throw new IntegrationInputError("definition.theme", "source integrations cannot publish theme tokens");
        }
        return;
    }
    if (parsedArtifacts.some((artifact) => artifact.type !== "bloc")) {
        throw new IntegrationInputError("definition.artifacts", "collection integrations can publish only blocs");
    }
    for (const field of [
        "dependencies",
        "secrets",
        "generatedSecrets",
        "connectors",
        "provisions",
        "afterInstallation",
        "security",
    ] as const) {
        if (definition[field] !== undefined) {
            throw new IntegrationInputError(`definition.${field}`, "is not supported by collection integrations");
        }
    }
    if (definition.inputs.length) {
        throw new IntegrationInputError("definition.inputs", "collection integrations cannot declare setup inputs");
    }
    const categories = new Set(definition.resourceCategories.map(({ id }) => id));
    const artifacts = new Set((definition.artifacts ?? []).map(({ bloc }) => bloc.tag));
    for (const resource of definition.resources) {
        if (!categories.has(resource.category)) {
            throw new IntegrationInputError(
                `definition.resources.${resource.id}.category`,
                "references an unknown category",
            );
        }
        if (!artifacts.has(resource.artifact)) {
            throw new IntegrationInputError(
                `definition.resources.${resource.id}.artifact`,
                "references an unknown bloc",
            );
        }
    }
    if (artifacts.size !== definition.resources.length) {
        throw new IntegrationInputError("definition.resources", "must declare exactly one resource per bloc artifact");
    }
}

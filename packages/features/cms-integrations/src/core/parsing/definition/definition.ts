import { IntegrationInputError, MissingIntegrationParam } from "../../errors";
import { assertPasswordInputsDeclareSecrets, sensitiveInputNames } from "../../shared/inputSensitivity";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import { parseArtifactTemplates } from "../templates/sourceTemplates";
import { parseConnectorTemplates, validateConnectorDefinition } from "../templates/connectorTemplates";
import { parseDependencies, validateDependencies } from "./dependencies";
import { parseIntegrationIcon } from "./icon";
import { assertUniqueInputs, parseInput, validateInputDefinition } from "./inputDefinitions";
import {
    assertUniqueSecretBindingNames,
    parseGeneratedSecretTemplates,
    parseSecretTemplates,
    validateGeneratedSecretDefinition,
} from "../templates/secretTemplates";
import { parseSecurityDefinition, validateSecurityDefinition } from "./securityDefinition";
import { parseUiDefinition } from "./uiDefinition";
import { isRecord, parseJsonAnswer, text } from "./values";

export function assertDefinitionUsable(definition: IntegrationDefinition): void {
    assertUniqueInputs(definition.inputs);
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
    if (definition.security) {
        validateSecurityDefinition(definition.security);
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
    const kind = text(value.kind);
    if (!kind) {
        throw new MissingIntegrationParam("definition.kind");
    }
    const label = text(value.label);
    if (!label) {
        throw new MissingIntegrationParam("definition.label");
    }
    if (!Array.isArray(value.inputs)) {
        throw new IntegrationInputError("definition.inputs", "must be an array");
    }

    const inputs = value.inputs.map((input, index) => parseInput(input, `definition.inputs.${index}`));
    assertUniqueInputs(inputs);
    const parsedDefinition = { kind, label, inputs } satisfies Pick<IntegrationDefinition, "kind" | "label" | "inputs">;
    assertPasswordInputsDeclareSecrets(parsedDefinition);
    const secrets = parseSecretTemplates(value.secrets, new Set(sensitiveInputNames(parsedDefinition)));
    const generatedSecrets = parseGeneratedSecretTemplates(value.generatedSecrets);
    assertUniqueSecretBindingNames(secrets, generatedSecrets);
    const connectors = parseConnectorTemplates(value.connectors);
    const artifacts = parseArtifactTemplates(value.artifacts);
    const dependencies = parseDependencies(value.dependencies, kind);
    const icon = parseIntegrationIcon(value.icon);
    const ui = parseUiDefinition(value.ui);
    const security = parseSecurityDefinition(value.security);

    return {
        kind,
        label,
        ...(text(value.version) ? { version: text(value.version)! } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        ...(icon ? { icon } : {}),
        inputs,
        ...(secrets.length ? { secrets } : {}),
        ...(generatedSecrets.length ? { generatedSecrets } : {}),
        ...(connectors.length ? { connectors } : {}),
        ...(artifacts.length ? { artifacts } : {}),
        ...(ui ? { ui } : {}),
        ...(security ? { security } : {}),
        ...(dependencies.length ? { dependencies } : {}),
    };
}

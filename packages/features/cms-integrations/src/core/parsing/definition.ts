import { IntegrationInputError, MissingIntegrationParam } from "../errors";
import {
    assertPasswordInputsDeclareSecrets,
    sensitiveInputNames,
} from "../shared/inputSensitivity";
import type {
    DeclarativeSecretTemplate,
    IntegrationDefinition,
    IntegrationInput,
} from "../../interfaces/Integration";
import { parseArtifactTemplates } from "./sourceTemplates";
import { parseUiDefinition } from "./uiDefinition";
import {
    isInputType,
    isRecord,
    parseJsonAnswer,
    RESERVED_INPUT_NAMES,
    text,
} from "./values";

export function assertDefinitionUsable(definition: IntegrationDefinition): void {
    assertUniqueInputs(definition.inputs);
    assertPasswordInputsDeclareSecrets(definition);
    for (const input of definition.inputs) validateInputDefinition(input);
    const secretInputs = new Set(sensitiveInputNames(definition));
    for (const secret of definition.secrets ?? []) {
        if (!secretInputs.has(secret.input)) {
            throw new IntegrationInputError(`definition.secrets.${secret.input}`, "must reference a secret input");
        }
    }
}

export function parseOptionalDefinition(value: unknown): IntegrationDefinition | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = parseJsonAnswer(value, "definition");
    return parseIntegrationDefinition(parsed);
}

export function parseIntegrationDefinition(value: unknown): IntegrationDefinition {
    if (!isRecord(value)) throw new IntegrationInputError("definition", "must be an object");
    return parseDefinition(value);
}

function parseDefinition(value: Record<string, unknown>): IntegrationDefinition {
    const kind = text(value.kind);
    if (!kind) throw new MissingIntegrationParam("definition.kind");
    const label = text(value.label);
    if (!label) throw new MissingIntegrationParam("definition.label");
    if (!Array.isArray(value.inputs)) throw new IntegrationInputError("definition.inputs", "must be an array");
    const inputs = value.inputs.map((input, index) => parseInput(input, `definition.inputs.${index}`));
    assertUniqueInputs(inputs);
    const parsedDefinition = { kind, label, inputs } satisfies Pick<IntegrationDefinition, "kind" | "label" | "inputs">;
    assertPasswordInputsDeclareSecrets(parsedDefinition);
    const secrets = parseSecretTemplates(value.secrets, new Set(sensitiveInputNames(parsedDefinition)));
    const artifacts = parseArtifactTemplates(value.artifacts);
    const ui = parseUiDefinition(value.ui);
    return {
        kind,
        label,
        ...(text(value.version) ? { version: text(value.version)! } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        inputs,
        ...(secrets.length ? { secrets } : {}),
        ...(artifacts.length ? { artifacts } : {}),
        ...(ui ? { ui } : {}),
    };
}

function parseInput(value: unknown, name: string): IntegrationInput {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const inputName = text(value.name);
    if (!inputName) throw new MissingIntegrationParam(`${name}.name`);
    if (RESERVED_INPUT_NAMES.has(inputName)) throw new IntegrationInputError(`${name}.name`, "uses a reserved integration field name");
    const label = text(value.label);
    if (!label) throw new MissingIntegrationParam(`${name}.label`);
    const type = text(value.type);
    if (!isInputType(type)) throw new IntegrationInputError(`${name}.type`, "must be text, url, password, select, boolean, or json");
    const options = Array.isArray(value.options) ? parseOptionsList(value.options, `${name}.options`) : undefined;
    if (type === "select" && !options?.length) {
        throw new IntegrationInputError(`${name}.options`, "select inputs must declare at least one option");
    }
    return {
        name: inputName,
        label,
        type,
        ...(value.required === true ? { required: true } : {}),
        ...(typeof value.defaultValue === "string" || typeof value.defaultValue === "boolean" ? { defaultValue: value.defaultValue } : {}),
        ...(options ? { options } : {}),
        ...(value.secret === true ? { secret: true } : {}),
    };
}

function validateInputDefinition(input: IntegrationInput): void {
    if (RESERVED_INPUT_NAMES.has(input.name)) {
        throw new IntegrationInputError(`definition.inputs.${input.name}`, "uses a reserved integration field name");
    }
    if (!isInputType(input.type)) {
        throw new IntegrationInputError(`definition.inputs.${input.name}.type`, "must be text, url, password, select, boolean, or json");
    }
    if (input.type === "select" && !input.options?.length) {
        throw new IntegrationInputError(`definition.inputs.${input.name}.options`, "select inputs must declare at least one option");
    }
}

function assertUniqueInputs(inputs: IntegrationInput[]): void {
    const seen = new Set<string>();
    for (const input of inputs) {
        if (seen.has(input.name)) throw new IntegrationInputError(`definition.inputs.${input.name}`, "duplicate input name");
        seen.add(input.name);
    }
}

function parseSecretTemplates(value: unknown, secretInputs: ReadonlySet<string>): DeclarativeSecretTemplate[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new IntegrationInputError("definition.secrets", "must be an array");
    return value.map((entry, index) => parseSecretTemplate(entry, `definition.secrets.${index}`, secretInputs));
}

function parseSecretTemplate(value: unknown, name: string, secretInputs: ReadonlySet<string>): DeclarativeSecretTemplate {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const input = text(value.input);
    if (!input) throw new MissingIntegrationParam(`${name}.input`);
    if (!secretInputs.has(input)) throw new IntegrationInputError(`${name}.input`, "must reference a secret input");
    const key = text(value.key);
    if (!key) throw new MissingIntegrationParam(`${name}.key`);
    return { input, key };
}

function parseOptionsList(values: unknown[], name: string): Array<{ label: string; value: string }> {
    return values.map((entry, index) => {
        if (!isRecord(entry)) throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        const label = text(entry.label);
        const value = text(entry.value);
        if (!label) throw new MissingIntegrationParam(`${name}.${index}.label`);
        if (!value) throw new MissingIntegrationParam(`${name}.${index}.value`);
        return { label, value };
    });
}

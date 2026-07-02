import { IntegrationInputError, MissingIntegrationParam } from "../errors";
import {
    assertPasswordInputsDeclareSecrets,
    sensitiveInputNames,
} from "../shared/inputSensitivity";
import type {
    DeclarativeConnectorTemplate,
    DeclarativeGeneratedSecretTemplate,
    DeclarativeSecretTemplate,
    IntegrationDefinition,
    IntegrationInput,
    IntegrationSecurityDefinition,
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
    assertUniqueSecretBindingNames(definition.secrets ?? [], definition.generatedSecrets ?? []);
    for (const secret of definition.generatedSecrets ?? []) validateGeneratedSecretDefinition(secret);
    for (const connector of definition.connectors ?? []) validateConnectorDefinition(connector);
    if (definition.security) validateSecurityDefinition(definition.security);
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
    const generatedSecrets = parseGeneratedSecretTemplates(value.generatedSecrets);
    assertUniqueSecretBindingNames(secrets, generatedSecrets);
    const connectors = parseConnectorTemplates(value.connectors);
    const artifacts = parseArtifactTemplates(value.artifacts);
    const ui = parseUiDefinition(value.ui);
    const security = parseSecurityDefinition(value.security);
    return {
        kind,
        label,
        ...(text(value.version) ? { version: text(value.version)! } : {}),
        ...(text(value.category) ? { category: text(value.category)! } : {}),
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        inputs,
        ...(secrets.length ? { secrets } : {}),
        ...(generatedSecrets.length ? { generatedSecrets } : {}),
        ...(connectors.length ? { connectors } : {}),
        ...(artifacts.length ? { artifacts } : {}),
        ...(ui ? { ui } : {}),
        ...(security ? { security } : {}),
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

function validateGeneratedSecretDefinition(secret: DeclarativeGeneratedSecretTemplate): void {
    if (!secret.name) throw new IntegrationInputError("definition.generatedSecrets.name", "is required");
    if (!secret.key) throw new IntegrationInputError(`definition.generatedSecrets.${secret.name}.key`, "is required");
    if (secret.generator !== undefined && secret.generator !== "token") {
        throw new IntegrationInputError(`definition.generatedSecrets.${secret.name}.generator`, "must be token");
    }
    if (secret.bytes !== undefined && (!Number.isInteger(secret.bytes) || secret.bytes < 16 || secret.bytes > 64)) {
        throw new IntegrationInputError(`definition.generatedSecrets.${secret.name}.bytes`, "must be an integer between 16 and 64");
    }
}

function validateConnectorDefinition(connector: DeclarativeConnectorTemplate): void {
    if (!connector.provider) throw new IntegrationInputError("definition.connectors.provider", "is required");
    for (const schema of connector.dataApiSchemas ?? []) {
        if (!schema) throw new IntegrationInputError(`definition.connectors.${connector.provider}.dataApiSchemas`, "must contain non-empty strings");
    }
    for (const schema of connector.schemas ?? []) {
        if (!schema.path) throw new IntegrationInputError(`definition.connectors.${connector.provider}.schemas.path`, "is required");
    }
    for (const fn of connector.functions ?? []) {
        if (!fn.name) throw new IntegrationInputError(`definition.connectors.${connector.provider}.functions.name`, "is required");
        if (!fn.directory) throw new IntegrationInputError(`definition.connectors.${connector.provider}.functions.directory`, "is required");
    }
}

function validateSecurityDefinition(security: IntegrationSecurityDefinition): void {
    if (security.csp === undefined) return;
    parseCspPolicy(security.csp, "definition.security.csp");
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

function parseGeneratedSecretTemplates(value: unknown): DeclarativeGeneratedSecretTemplate[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new IntegrationInputError("definition.generatedSecrets", "must be an array");
    return value.map((entry, index) => parseGeneratedSecretTemplate(entry, `definition.generatedSecrets.${index}`));
}

function parseGeneratedSecretTemplate(value: unknown, name: string): DeclarativeGeneratedSecretTemplate {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const secretName = text(value.name);
    if (!secretName) throw new MissingIntegrationParam(`${name}.name`);
    const key = text(value.key);
    if (!key) throw new MissingIntegrationParam(`${name}.key`);
    if (value.generator !== undefined && value.generator !== "token") {
        throw new IntegrationInputError(`${name}.generator`, "must be token");
    }
    const bytes = value.bytes;
    if (bytes !== undefined && (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 16 || bytes > 64)) {
        throw new IntegrationInputError(`${name}.bytes`, "must be an integer between 16 and 64");
    }
    return {
        name: secretName,
        key,
        ...(value.generator === "token" ? { generator: "token" } : {}),
        ...(typeof bytes === "number" ? { bytes } : {}),
        ...(text(value.prefix) ? { prefix: text(value.prefix)! } : {}),
    };
}

function assertUniqueSecretBindingNames(
    secrets: DeclarativeSecretTemplate[],
    generatedSecrets: DeclarativeGeneratedSecretTemplate[],
): void {
    const seen = new Set<string>();
    for (const secret of secrets) {
        if (seen.has(secret.input)) throw new IntegrationInputError(`definition.secrets.${secret.input}`, "duplicate secret binding name");
        seen.add(secret.input);
    }
    for (const secret of generatedSecrets) {
        if (seen.has(secret.name)) throw new IntegrationInputError(`definition.generatedSecrets.${secret.name}`, "duplicate secret binding name");
        seen.add(secret.name);
    }
}

function parseConnectorTemplates(value: unknown): DeclarativeConnectorTemplate[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new IntegrationInputError("definition.connectors", "must be an array");
    return value.map((entry, index) => parseConnectorTemplate(entry, `definition.connectors.${index}`));
}

function parseConnectorTemplate(value: unknown, name: string): DeclarativeConnectorTemplate {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const provider = text(value.provider);
    if (!provider) throw new MissingIntegrationParam(`${name}.provider`);
    return {
        provider,
        ...(text(value.root) ? { root: text(value.root)! } : {}),
        ...(value.dataApiSchemas !== undefined ? { dataApiSchemas: parseConnectorStringList(value.dataApiSchemas, `${name}.dataApiSchemas`) } : {}),
        ...(value.schemas !== undefined ? { schemas: parseConnectorSchemas(value.schemas, `${name}.schemas`) } : {}),
        ...(value.functions !== undefined ? { functions: parseConnectorFunctions(value.functions, `${name}.functions`) } : {}),
    };
}

function parseSecurityDefinition(value: unknown): IntegrationSecurityDefinition | undefined {
    if (value === undefined || value === null) return undefined;
    if (!isRecord(value)) throw new IntegrationInputError("definition.security", "must be an object");
    const csp = parseCspPolicy(value.csp, "definition.security.csp");
    return csp ? { csp } : undefined;
}

function parseCspPolicy(value: unknown, name: string): NonNullable<IntegrationSecurityDefinition["csp"]> | undefined {
    if (value === undefined || value === null) return undefined;
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const out: NonNullable<IntegrationSecurityDefinition["csp"]> = {};
    for (const directive of ["connect", "media", "style", "script", "frame"] as const) {
        if (value[directive] !== undefined) {
            const sources = parseCspSourceList(value[directive], `${name}.${directive}`);
            if (sources.length) out[directive] = sources;
        }
    }
    return Object.keys(out).length ? out : undefined;
}

function parseCspSourceList(value: unknown, name: string): string[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return [...new Set(value.map((entry, index) => parseCspSource(entry, `${name}.${index}`)))];
}

function parseCspSource(value: unknown, name: string): string {
    const source = text(value);
    if (!source) throw new IntegrationInputError(name, "must be a non-empty string");
    try {
        return new URL(source).origin;
    } catch {
        throw new IntegrationInputError(name, "must be an absolute origin");
    }
}

function parseConnectorStringList(value: unknown, name: string): string[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => {
        const parsed = text(entry);
        if (!parsed) throw new IntegrationInputError(`${name}.${index}`, "must be a non-empty string");
        return parsed;
    });
}

function parseConnectorSchemas(value: unknown, name: string): NonNullable<DeclarativeConnectorTemplate["schemas"]> {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => {
        if (typeof entry === "string") return { path: entry };
        if (!isRecord(entry)) throw new IntegrationInputError(`${name}.${index}`, "must be a string or object");
        const path = text(entry.path);
        if (!path) throw new MissingIntegrationParam(`${name}.${index}.path`);
        return { path };
    });
}

function parseConnectorFunctions(value: unknown, name: string): NonNullable<DeclarativeConnectorTemplate["functions"]> {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseConnectorFunction(entry, `${name}.${index}`));
}

function parseConnectorFunction(value: unknown, name: string): NonNullable<DeclarativeConnectorTemplate["functions"]>[number] {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const functionName = text(value.name);
    if (!functionName) throw new MissingIntegrationParam(`${name}.name`);
    const directory = text(value.directory);
    if (!directory) throw new MissingIntegrationParam(`${name}.directory`);
    return {
        name: functionName,
        directory,
        ...(text(value.configPath) ? { configPath: text(value.configPath)! } : {}),
        ...(value.secrets !== undefined ? { secrets: parseConnectorSecretMap(value.secrets, `${name}.secrets`) } : {}),
    };
}

function parseConnectorSecretMap(value: unknown, name: string): Record<string, string> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== "string") throw new IntegrationInputError(`${name}.${key}`, "must be a string");
        out[key] = entry;
    }
    return out;
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

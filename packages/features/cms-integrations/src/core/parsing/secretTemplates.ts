import { IntegrationInputError, MissingIntegrationParam } from "../errors";
import type {
    DeclarativeGeneratedSecretTemplate,
    DeclarativeSecretTemplate,
} from "../../interfaces/Integration";
import { isRecord, text } from "./values";

export function parseSecretTemplates(value: unknown, secretInputs: ReadonlySet<string>): DeclarativeSecretTemplate[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new IntegrationInputError("definition.secrets", "must be an array");
    return value.map((entry, index) => parseSecretTemplate(entry, `definition.secrets.${index}`, secretInputs));
}

export function parseGeneratedSecretTemplates(value: unknown): DeclarativeGeneratedSecretTemplate[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new IntegrationInputError("definition.generatedSecrets", "must be an array");
    return value.map((entry, index) => parseGeneratedSecretTemplate(entry, `definition.generatedSecrets.${index}`));
}

export function assertUniqueSecretBindingNames(
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

export function validateGeneratedSecretDefinition(secret: DeclarativeGeneratedSecretTemplate): void {
    if (!secret.name) throw new IntegrationInputError("definition.generatedSecrets.name", "is required");
    if (!secret.key) throw new IntegrationInputError(`definition.generatedSecrets.${secret.name}.key`, "is required");
    if (secret.generator !== undefined && secret.generator !== "token") {
        throw new IntegrationInputError(`definition.generatedSecrets.${secret.name}.generator`, "must be token");
    }
    if (secret.bytes !== undefined && (!Number.isInteger(secret.bytes) || secret.bytes < 16 || secret.bytes > 64)) {
        throw new IntegrationInputError(`definition.generatedSecrets.${secret.name}.bytes`, "must be an integer between 16 and 64");
    }
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

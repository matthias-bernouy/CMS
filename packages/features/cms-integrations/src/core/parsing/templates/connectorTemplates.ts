import { IntegrationInputError, MissingIntegrationParam } from "../../errors";
import type { DeclarativeConnectorTemplate } from "../../../interfaces/Integration";
import { isRecord, text } from "../definition/values";
import { parseConnectorFunctionCompatibility } from "./connector-compatibility/function";
import { parseConnectorCompatibility } from "./connector-compatibility";
import { parseConnectorSchemas } from "./connectorSchemaTemplates";
import { parseConnectorMigrationPlan, validateMigrationAwareConnectorLayout } from "./connector-migration";

export function parseConnectorTemplates(value: unknown, definitionVersion?: string): DeclarativeConnectorTemplate[] {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new IntegrationInputError("definition.connectors", "must be an array");
    }
    return value.map((entry, index) =>
        parseConnectorTemplate(entry, `definition.connectors.${index}`, definitionVersion),
    );
}

export function validateConnectorDefinition(connector: DeclarativeConnectorTemplate): void {
    if (!connector.provider) {
        throw new IntegrationInputError("definition.connectors.provider", "is required");
    }
    for (const schema of connector.dataApiSchemas ?? []) {
        if (!schema) {
            throw new IntegrationInputError(
                `definition.connectors.${connector.provider}.dataApiSchemas`,
                "must contain non-empty strings",
            );
        }
    }
    for (const schema of connector.schemas ?? []) {
        const reference = "path" in schema ? schema.path : schema.manifest;
        if (!reference) {
            throw new IntegrationInputError(
                `definition.connectors.${connector.provider}.schemas`,
                "must define exactly one path or manifest",
            );
        }
    }
    for (const fn of connector.functions ?? []) {
        if (!fn.name) {
            throw new IntegrationInputError(
                `definition.connectors.${connector.provider}.functions.name`,
                "is required",
            );
        }
        if (!fn.directory) {
            throw new IntegrationInputError(
                `definition.connectors.${connector.provider}.functions.directory`,
                "is required",
            );
        }
    }
    validateMigrationAwareConnectorLayout(
        connector,
        `definition.connectors.${connector.connectorKey ?? connector.provider}`,
    );
}

function parseConnectorTemplate(
    value: unknown,
    name: string,
    definitionVersion?: string,
): DeclarativeConnectorTemplate {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const provider = text(value.provider);
    if (!provider) {
        throw new MissingIntegrationParam(`${name}.provider`);
    }
    return {
        provider,
        ...(text(value.connectorKey) ? { connectorKey: text(value.connectorKey)! } : {}),
        ...(text(value.lineageId) ? { lineageId: text(value.lineageId)! } : {}),
        ...(value.migrationRevision !== undefined
            ? { migrationRevision: parseMigrationRevision(value.migrationRevision, `${name}.migrationRevision`) }
            : {}),
        ...(value.migration !== undefined
            ? { migration: parseConnectorMigrationPlan(value.migration, `${name}.migration`, definitionVersion) }
            : {}),
        ...(text(value.root) ? { root: text(value.root)! } : {}),
        ...(value.dataApiSchemas !== undefined
            ? { dataApiSchemas: parseConnectorStringList(value.dataApiSchemas, `${name}.dataApiSchemas`) }
            : {}),
        ...(value.schemas !== undefined ? { schemas: parseConnectorSchemas(value.schemas, `${name}.schemas`) } : {}),
        ...(value.functions !== undefined
            ? { functions: parseConnectorFunctions(value.functions, `${name}.functions`) }
            : {}),
        ...(value.compatibility !== undefined
            ? { compatibility: parseConnectorCompatibility(value.compatibility, provider, `${name}.compatibility`) }
            : {}),
    };
}

function parseMigrationRevision(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new IntegrationInputError(name, "must be a non-negative safe integer");
    }
    return value as number;
}

function parseConnectorStringList(value: unknown, name: string): string[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => {
        const parsed = text(entry);
        if (!parsed) {
            throw new IntegrationInputError(`${name}.${index}`, "must be a non-empty string");
        }
        return parsed;
    });
}

function parseConnectorFunctions(value: unknown, name: string): NonNullable<DeclarativeConnectorTemplate["functions"]> {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => parseConnectorFunction(entry, `${name}.${index}`));
}

function parseConnectorFunction(
    value: unknown,
    name: string,
): NonNullable<DeclarativeConnectorTemplate["functions"]>[number] {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const functionName = text(value.name);
    if (!functionName) {
        throw new MissingIntegrationParam(`${name}.name`);
    }
    const directory = text(value.directory);
    if (!directory) {
        throw new MissingIntegrationParam(`${name}.directory`);
    }
    return {
        name: functionName,
        directory,
        ...(text(value.configPath) ? { configPath: text(value.configPath)! } : {}),
        ...(value.secrets !== undefined ? { secrets: parseConnectorSecretMap(value.secrets, `${name}.secrets`) } : {}),
        ...(value.compatibility !== undefined
            ? { compatibility: parseConnectorFunctionCompatibility(value.compatibility, `${name}.compatibility`) }
            : {}),
    };
}

function parseConnectorSecretMap(value: unknown, name: string): Record<string, string> {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const out: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== "string") {
            throw new IntegrationInputError(`${name}.${key}`, "must be a string");
        }
        out[key] = entry;
    }
    return out;
}

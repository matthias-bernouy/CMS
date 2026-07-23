import { IntegrationInputError, MissingIntegrationParam } from "../../errors";
import type {
    DeclarativeProvisionOutputTemplate,
    DeclarativeProvisionTemplate,
    IntegrationAnswerValue,
} from "../../../interfaces/Integration";
import { isJsonValue, isRecord, text } from "../definition/values";

export function parseProvisionTemplates(value: unknown): DeclarativeProvisionTemplate[] {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new IntegrationInputError("definition.provisions", "must be an array");
    }
    return value.map((entry, index) => parseProvisionTemplate(entry, `definition.provisions.${index}`));
}

export function validateProvisionDefinition(provision: DeclarativeProvisionTemplate): void {
    if (!provision.provider) {
        throw new IntegrationInputError("definition.provisions.provider", "is required");
    }
    const names = new Set<string>();
    for (const output of provision.outputs) {
        if (names.has(output.name)) {
            throw new IntegrationInputError(
                `definition.provisions.${provision.provider}.outputs`,
                `contains duplicate name "${output.name}"`,
            );
        }
        names.add(output.name);
    }
}

function parseProvisionTemplate(value: unknown, name: string): DeclarativeProvisionTemplate {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const provider = text(value.provider);
    if (!provider) {
        throw new MissingIntegrationParam(`${name}.provider`);
    }
    if (!isRecord(value.configuration) || !isJsonValue(value.configuration)) {
        throw new IntegrationInputError(`${name}.configuration`, "must be a JSON object");
    }
    if (!Array.isArray(value.outputs) || value.outputs.length === 0) {
        throw new IntegrationInputError(`${name}.outputs`, "must be a non-empty array");
    }
    const provision = {
        provider,
        configuration: value.configuration as Record<string, IntegrationAnswerValue>,
        outputs: value.outputs.map((output, index) => parseOutput(output, `${name}.outputs.${index}`)),
    };
    validateProvisionDefinition(provision);
    return provision;
}

function parseOutput(value: unknown, name: string): DeclarativeProvisionOutputTemplate {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const outputName = text(value.name);
    const key = text(value.key);
    if (!outputName) {
        throw new MissingIntegrationParam(`${name}.name`);
    }
    if (!key) {
        throw new MissingIntegrationParam(`${name}.key`);
    }
    return { name: outputName, key };
}

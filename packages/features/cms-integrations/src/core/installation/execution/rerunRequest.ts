import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type { IntegrationImportDeps, IntegrationImportDto } from "../../../interfaces/IntegrationImport";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import { IntegrationInputError } from "../../errors";
import { parseIntegrationImportDto } from "../../parsing/parseIntegrationImportDto";
import { isSensitiveInput } from "../../shared/inputSensitivity";
import { hasAnswer } from "../ids";

export async function buildRerunDto(
    deps: IntegrationImportDeps,
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
    body: Record<string, unknown>,
    siteIntegrations: IntegrationDefinition[],
): Promise<IntegrationImportDto> {
    const rawAnswers = isRecord(body.answers)
        ? { ...installation.answersSnapshot, ...rerunAnswerOverrides(definition, installation, body.answers) }
        : { ...installation.answersSnapshot };
    const missing = definition.inputs.filter((input) => isSensitiveInput(input) && !hasAnswer(rawAnswers[input.name]));
    const restored = await Promise.all(missing.map((input) => restoreSecretAnswer(deps, installation, input.name)));
    for (const [name, value] of restored) {
        rawAnswers[name] = value;
    }
    const rawOptions = isRecord(body.options) ? body.options : {};
    return parseIntegrationImportDto(
        {
            kind: installation.id,
            answers: rawAnswers,
            options: { ...rawOptions, force: true },
        },
        siteIntegrations,
    );
}

async function restoreSecretAnswer(
    deps: IntegrationImportDeps,
    installation: IntegrationInstallation,
    inputName: string,
): Promise<readonly [string, string]> {
    const key = installation.secretRefs[inputName];
    if (!key) {
        throw new IntegrationInputError(`answers.${inputName}`, "secret must be provided");
    }
    const value = await deps.secrets.get(key);
    if (!value) {
        throw new IntegrationInputError(`answers.${inputName}`, "stored secret is missing");
    }
    return [inputName, value] as const;
}

function rerunAnswerOverrides(
    definition: IntegrationDefinition,
    installation: IntegrationInstallation,
    answers: Record<string, unknown>,
): Record<string, unknown> {
    const overrides = { ...answers };
    if (Object.prototype.hasOwnProperty.call(overrides, "id")) {
        const hasIdentityInput = definition.inputs.some((input) => input.name === "id");
        if (hasIdentityInput && !sameAnswer(overrides.id, installation.answersSnapshot.id)) {
            throw new IntegrationInputError("answers.id", "cannot be changed on rerun");
        }
        delete overrides.id;
    }
    return overrides;
}

function sameAnswer(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

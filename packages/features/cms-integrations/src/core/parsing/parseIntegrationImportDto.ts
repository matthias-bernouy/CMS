import { findIntegration } from "../catalog";
import { IntegrationInputError, MissingIntegrationParam } from "../errors";
import type {
    IntegrationAnswerValue,
    IntegrationDefinition,
} from "../../interfaces/Integration";
import type {
    IntegrationImportDto,
    IntegrationImportRequest,
} from "../../interfaces/IntegrationImport";
import {
    assertDefinitionUsable,
    parseOptionalDefinition,
} from "./definition";
import {
    booleanAnswer,
    isJsonValue,
    parseAnswersBody,
    parseFlatAnswersBody,
    parseJsonAnswer,
    parseOptions,
    text,
    validateUrl,
} from "./values";

export function parseIntegrationImportRequest(
    body: Record<string, unknown>,
    siteIntegrations: IntegrationDefinition[] = [],
): IntegrationImportRequest {
    const manualDefinition = parseOptionalDefinition(body.definition);
    const definitions = manualDefinition ? [manualDefinition, ...siteIntegrations] : siteIntegrations;
    return {
        dto: parseIntegrationImportDto(body, definitions, manualDefinition),
        siteIntegrations: definitions,
    };
}

export function parseIntegrationImportDto(
    body: Record<string, unknown>,
    siteIntegrations: IntegrationDefinition[] = [],
    manualDefinition?: IntegrationDefinition,
): IntegrationImportDto {
    const kind = manualDefinition?.kind ?? text(body.kind);
    if (!kind) throw new MissingIntegrationParam("kind");

    const definition = findIntegration(kind, siteIntegrations);
    if (!definition) throw new IntegrationInputError("kind", `unknown integration "${kind}"`);
    assertDefinitionUsable(definition);

    const rawAnswers = parseAnswersBody(body.answers) ?? parseFlatAnswersBody(body);
    const answers = parseAnswers(definition, rawAnswers);
    return { kind, answers, options: parseOptions(body.options) };
}

function parseAnswers(
    definition: IntegrationDefinition,
    rawAnswers: Record<string, unknown>,
): Record<string, IntegrationAnswerValue> {
    const answers: Record<string, IntegrationAnswerValue> = {};
    for (const input of definition.inputs) {
        const raw = answerValue(rawAnswers[input.name], input.defaultValue);
        if (raw === undefined || raw === null || raw === "") {
            if (input.required) throw new MissingIntegrationParam(`answers.${input.name}`);
            continue;
        }
        if (input.type === "boolean") answers[input.name] = booleanAnswer(raw, `answers.${input.name}`);
        else if (input.type === "json") answers[input.name] = jsonAnswer(raw, `answers.${input.name}`);
        else answers[input.name] = stringAnswer(input, raw);
    }
    return answers;
}

function answerValue(candidate: unknown, defaultValue: unknown): unknown {
    return (candidate === undefined || candidate === null || candidate === "") && defaultValue !== undefined
        ? defaultValue
        : candidate;
}

function jsonAnswer(raw: unknown, name: string): IntegrationAnswerValue {
    const value = parseJsonAnswer(raw, name);
    if (!isJsonValue(value)) throw new IntegrationInputError(name, "must be JSON-compatible");
    return value;
}

function stringAnswer(input: IntegrationDefinition["inputs"][number], raw: unknown): string {
    if (typeof raw !== "string" || !raw.trim()) {
        throw new IntegrationInputError(`answers.${input.name}`, "must be a non-empty string");
    }
    const value = raw.trim();
    if (input.type === "url") validateUrl(input.name, value);
    if (input.type === "select" && !input.options?.some(option => option.value === value)) {
        throw new IntegrationInputError(`answers.${input.name}`, "must be one of the declared options");
    }
    return value;
}

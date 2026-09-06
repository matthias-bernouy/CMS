import { isSensitiveInput } from "../shared/inputSensitivity";
import { cleanText } from "./ids";
import type { IntegrationAnswerValue, IntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationImportDto, IntegrationImportResult } from "../../interfaces/IntegrationImport";
import { INTEGRATION_DEFINITION_SCHEMA_V1 } from "../../interfaces/IntegrationResources";

export function updateSecretRefs(
    current: Record<string, string>,
    result: IntegrationImportResult,
    secretInputs: string[],
): Record<string, string> {
    const allowed = new Set(secretInputs);
    const next = Object.fromEntries(Object.entries(current).filter(([input]) => allowed.has(input)));
    const writes = result.secrets ?? [];
    for (const secret of writes) {
        if (secret.input) {
            next[secret.input] = secret.key;
        }
    }
    return next;
}

export function sanitizeAnswers(
    definition: IntegrationDefinition,
    answers: Record<string, IntegrationAnswerValue>,
): Record<string, IntegrationAnswerValue> {
    const out: Record<string, IntegrationAnswerValue> = {};
    for (const [key, value] of Object.entries(answers)) {
        const input = definition.inputs.find((candidate) => candidate.name === key);
        if (input && !isSensitiveInput(input)) {
            out[key] = structuredClone(value);
        }
    }
    return out;
}

export function sanitizeDefinitionSnapshot(definition: IntegrationDefinition): IntegrationDefinition {
    return {
        ...definition,
        inputs: definition.inputs.map((input) => {
            if (!isSensitiveInput(input)) {
                return { ...input };
            }
            const { defaultValue: _defaultValue, ...rest } = input;
            return { ...rest };
        }),
    };
}

export function definitionSnapshotsEqual(left: IntegrationDefinition, right: IntegrationDefinition): boolean {
    return JSON.stringify(normalizeDefinitionSnapshot(left)) === JSON.stringify(normalizeDefinitionSnapshot(right));
}

export function declarativeValuesEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(normalizeSnapshot(left)) === JSON.stringify(normalizeSnapshot(right));
}

export function installationLabel(definition: IntegrationDefinition, dto: IntegrationImportDto): string {
    return cleanText(dto.answers.name) ?? cleanText(dto.answers.id) ?? definition.label;
}

function normalizeSnapshot(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(normalizeSnapshot);
    }
    if (!value || typeof value !== "object") {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, child]) => child !== undefined)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([key, child]) => [key, normalizeSnapshot(child)]),
    );
}

function normalizeDefinitionSnapshot(definition: IntegrationDefinition): unknown {
    const sanitized = sanitizeDefinitionSnapshot(definition);
    return normalizeSnapshot({
        ...sanitized,
        schema: sanitized.schema ?? INTEGRATION_DEFINITION_SCHEMA_V1,
    });
}

import { isSensitiveInput } from "../shared/inputSensitivity";
import { cleanText } from "./ids";
import type {
    IntegrationAnswerValue,
    IntegrationDefinition,
} from "../../interfaces/Integration";
import type {
    IntegrationImportDto,
    IntegrationImportResult,
} from "../../interfaces/IntegrationImport";

export function updateSecretRefs(
    current: Record<string, string>,
    result: IntegrationImportResult,
    secretInputs: string[],
): Record<string, string> {
    const allowed = new Set(secretInputs);
    const next = Object.fromEntries(Object.entries(current).filter(([input]) => allowed.has(input)));
    const writes = result.secrets ?? [];
    for (const secret of writes) {
        if (secret.input) next[secret.input] = secret.key;
    }
    return next;
}

export function sanitizeAnswers(
    definition: IntegrationDefinition,
    answers: Record<string, IntegrationAnswerValue>,
): Record<string, IntegrationAnswerValue> {
    const out: Record<string, IntegrationAnswerValue> = {};
    for (const [key, value] of Object.entries(answers)) {
        const input = definition.inputs.find(candidate => candidate.name === key);
        if (!input || !isSensitiveInput(input)) out[key] = structuredClone(value);
    }
    return out;
}

export function sanitizeDefinitionSnapshot(definition: IntegrationDefinition): IntegrationDefinition {
    return {
        ...definition,
        inputs: definition.inputs.map(input => {
            if (!isSensitiveInput(input)) return { ...input };
            const { defaultValue: _defaultValue, ...rest } = input;
            return { ...rest };
        }),
    };
}

export function instanceLabel(definition: IntegrationDefinition, dto: IntegrationImportDto): string {
    return cleanText(dto.instance?.label)
        ?? cleanText(dto.answers.name)
        ?? cleanText(dto.answers.id)
        ?? definition.label;
}

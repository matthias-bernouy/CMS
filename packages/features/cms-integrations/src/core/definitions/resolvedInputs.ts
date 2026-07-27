import type {
    IntegrationAnswerValue,
    IntegrationDefinition,
    IntegrationObjectListInput,
} from "../../interfaces/Integration";
import type { IntegrationPublishedPageResolver } from "../../interfaces/IntegrationImport";
import { IntegrationInputError } from "../errors";

export async function resolveIntegrationInputs(
    definition: IntegrationDefinition,
    answers: Record<string, IntegrationAnswerValue>,
    resolvePublishedPage?: IntegrationPublishedPageResolver,
): Promise<Record<string, IntegrationAnswerValue>> {
    const inputs = definition.inputs.filter(
        (input): input is IntegrationObjectListInput => input.type === "object-list",
    );
    return Object.fromEntries(
        await Promise.all(
            inputs.map(async (input) => [
                input.name,
                await resolveObjectList(input, answers[input.name], resolvePublishedPage),
            ]),
        ),
    );
}

async function resolveObjectList(
    input: IntegrationObjectListInput,
    answer: IntegrationAnswerValue | undefined,
    resolvePublishedPage?: IntegrationPublishedPageResolver,
): Promise<IntegrationAnswerValue[]> {
    if (answer === undefined) {
        return [];
    }
    if (!Array.isArray(answer)) {
        throw new IntegrationInputError(`answers.${input.name}`, "must be an array");
    }
    return Promise.all(
        answer.map(async (item, index) => {
            if (!isRecord(item)) {
                throw new IntegrationInputError(`answers.${input.name}.${index}`, "must be an object");
            }
            const resolved = structuredClone(item);
            for (const field of input.fields) {
                if (field.type !== "page-link" || !(field.name in item)) {
                    continue;
                }
                const path = item[field.name];
                const fieldPath = `answers.${input.name}.${index}.${field.name}`;
                if (typeof path !== "string" || !path) {
                    throw new IntegrationInputError(fieldPath, "must be a page path");
                }
                if (!resolvePublishedPage) {
                    throw new IntegrationInputError(fieldPath, "published page resolution is not configured");
                }
                const page = await resolvePublishedPage(path);
                if (!page) {
                    throw new IntegrationInputError(fieldPath, `page "${path}" is missing or not published`);
                }
                resolved[field.name] = page;
            }
            return resolved;
        }),
    );
}

function isRecord(value: IntegrationAnswerValue): value is Record<string, IntegrationAnswerValue> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

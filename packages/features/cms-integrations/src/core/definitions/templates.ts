import { IntegrationInputError } from "../errors";
import type { IntegrationAnswerValue } from "../../interfaces/Integration";
import { resolveExpression } from "./templateExpressions";

export type DependencyTemplateContext = Record<
    string,
    {
        id: string;
        answers: Record<string, IntegrationAnswerValue>;
        sourceId?: string;
    }
>;

export type TemplateContext = {
    answers: Record<string, IntegrationAnswerValue>;
    secrets: Record<string, string>;
    dependencies?: DependencyTemplateContext;
    generated?: Record<string, string>;
    connectors?: Record<string, Record<string, string>>;
    connectorSecrets?: Record<string, string>;
    secretInputs?: ReadonlySet<string>;
};

export function resolveTemplates<T>(value: T, context: TemplateContext): T {
    if (typeof value === "string") {
        return resolveTemplate(value, context) as T;
    }
    if (Array.isArray(value)) {
        return value.map((item) => resolveTemplates(item, context)) as T;
    }
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, resolveTemplates(entry, context)]),
        ) as T;
    }
    return value;
}

export function resolveTemplate(template: string, context: TemplateContext): string {
    let out = "";
    let offset = 0;

    while (offset < template.length) {
        const start = template.indexOf("{{", offset);
        if (start === -1) {
            return out + template.slice(offset);
        }

        const end = template.indexOf("}}", start + 2);
        if (end === -1) {
            return out + template.slice(offset);
        }

        out += template.slice(offset, start);
        const expression = template.slice(start + 2, end).trim();
        if (!expression) {
            throw new IntegrationInputError("template", "empty expression");
        }
        const value = resolveExpression(expression, context);
        out += typeof value === "boolean" ? String(value) : value;
        offset = end + 2;
    }

    return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

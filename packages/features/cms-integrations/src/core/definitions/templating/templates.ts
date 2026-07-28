import { IntegrationInputError } from "../../errors";
import type { IntegrationAnswerValue } from "../../../interfaces/Integration";
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
    resolved?: Record<string, IntegrationAnswerValue>;
    secrets: Record<string, string>;
    dependencies?: DependencyTemplateContext;
    generated?: Record<string, string>;
    connectors?: Record<string, Record<string, string>>;
    connectorSecrets?: Record<string, string>;
    secretInputs?: ReadonlySet<string>;
};

export function resolveTemplates<T>(value: T, context: TemplateContext): T {
    if (typeof value === "string") {
        const jsonValue = resolveExactJsonTemplate(value, context);
        if (jsonValue.matched) {
            return structuredClone(jsonValue.value) as T;
        }
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
        const json = expression.startsWith("json ");
        const value = resolveExpression(json ? expression.slice(5).trim() : expression, context);
        if (json) {
            out += JSON.stringify(value);
        } else if (typeof value === "string" || typeof value === "boolean") {
            out += String(value);
        } else {
            throw new IntegrationInputError("template", `expression "${expression}" cannot be interpolated as text`);
        }
        offset = end + 2;
    }

    return out;
}

function resolveExactJsonTemplate(
    template: string,
    context: TemplateContext,
): { matched: false } | { matched: true; value: IntegrationAnswerValue } {
    const match = template.match(/^\s*\{\{\s*json\s+(.+?)\s*\}\}\s*$/s);
    if (!match?.[1]) {
        return { matched: false };
    }
    return { matched: true, value: resolveExpression(match[1], context) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

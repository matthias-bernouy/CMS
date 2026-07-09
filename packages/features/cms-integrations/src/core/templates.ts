import { createHash } from "node:crypto";
import { IntegrationInputError } from "./errors";
import type { IntegrationAnswerValue } from "../interfaces/Integration";

export type DependencyTemplateContext = Record<string, {
    id: string;
    answers: Record<string, IntegrationAnswerValue>;
    sourceId?: string;
}>;

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
    if (typeof value === "string") return resolveTemplate(value, context) as T;
    if (Array.isArray(value)) return value.map(item => resolveTemplates(item, context)) as T;
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
        if (start === -1) return out + template.slice(offset);

        const end = template.indexOf("}}", start + 2);
        if (end === -1) return out + template.slice(offset);

        out += template.slice(offset, start);
        const expression = template.slice(start + 2, end).trim();
        if (!expression) throw new IntegrationInputError("template", "empty expression");
        const value = resolveExpression(expression, context);
        out += typeof value === "boolean" ? String(value) : value;
        offset = end + 2;
    }

    return out;
}

function resolveExpression(expression: string, context: TemplateContext): string | boolean {
    if (expression.startsWith("env ")) {
        const value = resolveExpression(expression.slice(4).trim(), context);
        return envSegment(String(value));
    }
    if (expression.startsWith("answers.")) {
        const key = expression.slice("answers.".length);
        if (!(key in context.answers)) throw new IntegrationInputError("template", `unknown answer "${key}"`);
        if (context.secretInputs?.has(key)) {
            throw new IntegrationInputError("template", `secret answer "${key}" must be referenced through secrets.${key}`);
        }
        const value = context.answers[key];
        if (typeof value !== "string" && typeof value !== "boolean") {
            throw new IntegrationInputError("template", `answer "${key}" cannot be interpolated as text`);
        }
        return value;
    }
    if (expression.startsWith("dependencies.")) {
        return resolveDependencyExpression(expression, context);
    }
    if (expression.startsWith("secrets.")) {
        const key = expression.slice("secrets.".length);
        const value = context.secrets[key];
        if (!value) throw new IntegrationInputError("template", `unknown secret "${key}"`);
        return value;
    }
    if (expression.startsWith("generated.")) {
        const key = expression.slice("generated.".length);
        const value = context.generated?.[key];
        if (!value) throw new IntegrationInputError("template", `unknown generated value "${key}"`);
        return value;
    }
    if (expression.startsWith("connectorSecrets.")) {
        const key = expression.slice("connectorSecrets.".length);
        const value = context.connectorSecrets?.[key];
        if (!value) throw new IntegrationInputError("template", `unknown connector secret "${key}"`);
        return value;
    }
    if (expression.startsWith("connectors.")) {
        const path = expression.slice("connectors.".length).split(".");
        if (path.length !== 2) throw new IntegrationInputError("template", `invalid connector expression "${expression}"`);
        const [provider, key] = path;
        const value = provider && key ? context.connectors?.[provider]?.[key] : undefined;
        if (!value) throw new IntegrationInputError("template", `unknown connector output "${expression}"`);
        return value;
    }
    throw new IntegrationInputError("template", `unsupported expression "${expression}"`);
}

function resolveDependencyExpression(expression: string, context: TemplateContext): string | boolean {
    const parts = expression.slice("dependencies.".length).split(".");
    const [name, key, ...rest] = parts;
    const dependency = name ? context.dependencies?.[name] : undefined;
    if (!name || !dependency) throw new IntegrationInputError("template", `unknown dependency "${name ?? ""}"`);
    if (key === "id" && !rest.length) return dependency.id;
    if (key === "sourceId" && !rest.length) {
        if (!dependency.sourceId) {
            throw new IntegrationInputError("template", `dependency "${name}" does not expose a single sourceId`);
        }
        return dependency.sourceId;
    }
    if (key === "answers" && rest.length === 1) {
        const answerKey = rest[0]!;
        if (!(answerKey in dependency.answers)) {
            throw new IntegrationInputError("template", `unknown dependency answer "${name}.${answerKey}"`);
        }
        const value = dependency.answers[answerKey];
        if (typeof value !== "string" && typeof value !== "boolean") {
            throw new IntegrationInputError("template", `dependency answer "${name}.${answerKey}" cannot be interpolated as text`);
        }
        return value;
    }
    throw new IntegrationInputError("template", `invalid dependency expression "${expression}"`);
}

function envSegment(value: string): string {
    const upper = value.toUpperCase();
    const normalized = upper.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!normalized) return "INTEGRATION";
    return normalized === upper ? normalized : `${normalized}_${shortHash(value)}`;
}

function shortHash(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 8).toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

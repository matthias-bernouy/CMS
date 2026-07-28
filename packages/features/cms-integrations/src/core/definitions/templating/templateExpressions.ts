import { createHash } from "node:crypto";
import { IntegrationInputError } from "../../errors";
import type { IntegrationAnswerValue } from "../../../interfaces/Integration";
import type { TemplateContext } from "./templates";

export function resolveExpression(expression: string, context: TemplateContext): IntegrationAnswerValue {
    if (expression.startsWith("env ")) {
        return envSegment(String(resolveExpression(expression.slice(4).trim(), context)));
    }
    if (expression.startsWith("answers.")) {
        return resolveAnswer(expression.slice("answers.".length), context);
    }
    if (expression.startsWith("resolved.")) {
        return resolveValue(context.resolved, expression.slice("resolved.".length), "resolved input");
    }
    if (expression.startsWith("dependencies.")) {
        return resolveDependencyExpression(expression, context);
    }
    if (expression.startsWith("secrets.")) {
        return requiredContextValue(context.secrets, expression.slice("secrets.".length), "secret");
    }
    if (expression.startsWith("generated.")) {
        return requiredContextValue(context.generated, expression.slice("generated.".length), "generated value");
    }
    if (expression.startsWith("connectorSecrets.")) {
        return requiredContextValue(
            context.connectorSecrets,
            expression.slice("connectorSecrets.".length),
            "connector secret",
        );
    }
    if (expression.startsWith("connectors.")) {
        const path = expression.slice("connectors.".length).split(".");
        if (path.length !== 2) {
            throw new IntegrationInputError("template", `invalid connector expression "${expression}"`);
        }
        const [provider, key] = path;
        const value = provider && key ? context.connectors?.[provider]?.[key] : undefined;
        if (!value) {
            throw new IntegrationInputError("template", `unknown connector output "${expression}"`);
        }
        return value;
    }
    throw new IntegrationInputError("template", `unsupported expression "${expression}"`);
}

function resolveAnswer(key: string, context: TemplateContext): string | boolean {
    if (!(key in context.answers)) {
        throw new IntegrationInputError("template", `unknown answer "${key}"`);
    }
    if (context.secretInputs?.has(key)) {
        throw new IntegrationInputError("template", `secret answer "${key}" must be referenced through secrets.${key}`);
    }
    const value = context.answers[key];
    if (typeof value !== "string" && typeof value !== "boolean") {
        throw new IntegrationInputError("template", `answer "${key}" cannot be interpolated as text`);
    }
    return value;
}

function resolveDependencyExpression(expression: string, context: TemplateContext): string | boolean {
    const parts = expression.slice("dependencies.".length).split(".");
    const [name, key, ...rest] = parts;
    const dependency = name ? context.dependencies?.[name] : undefined;
    if (!name || !dependency) {
        throw new IntegrationInputError("template", `unknown dependency "${name ?? ""}"`);
    }
    if (key === "id" && rest.length === 0) {
        return dependency.id;
    }
    if (key === "sourceId" && rest.length === 0) {
        if (!dependency.sourceId) {
            throw new IntegrationInputError("template", `dependency "${name}" does not expose a single sourceId`);
        }
        return dependency.sourceId;
    }
    if (key === "answers" && rest.length === 1) {
        return resolveDependencyAnswer(name, rest[0]!, dependency.answers);
    }
    if (key === "secrets" || key === "connectorSecrets") {
        throw new IntegrationInputError("template", "dependency secrets are not accessible");
    }
    throw new IntegrationInputError("template", `invalid dependency expression "${expression}"`);
}

function resolveDependencyAnswer(
    dependencyName: string,
    answerKey: string,
    answers: TemplateContext["answers"],
): string | boolean {
    if (!(answerKey in answers)) {
        throw new IntegrationInputError("template", `unknown dependency answer "${dependencyName}.${answerKey}"`);
    }
    const value = answers[answerKey];
    if (typeof value !== "string" && typeof value !== "boolean") {
        throw new IntegrationInputError(
            "template",
            `dependency answer "${dependencyName}.${answerKey}" cannot be interpolated as text`,
        );
    }
    return value;
}

function requiredContextValue(values: Record<string, string> | undefined, key: string, label: string): string {
    const value = values?.[key];
    if (!value) {
        throw new IntegrationInputError("template", `unknown ${label} "${key}"`);
    }
    return value;
}

function resolveValue(
    values: Record<string, IntegrationAnswerValue> | undefined,
    key: string,
    label: string,
): IntegrationAnswerValue {
    if (!values || !(key in values)) {
        throw new IntegrationInputError("template", `unknown ${label} "${key}"`);
    }
    return values[key]!;
}

function envSegment(value: string): string {
    const upper = value.toUpperCase();
    const normalized = upper.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!normalized) {
        return "INTEGRATION";
    }
    return normalized === upper ? normalized : `${normalized}_${shortHash(value)}`;
}

function shortHash(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 8).toUpperCase();
}

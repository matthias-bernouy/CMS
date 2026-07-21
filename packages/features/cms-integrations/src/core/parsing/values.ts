import { validateSourceTargetUrl } from "@bernouy/cms-sources";
import { IntegrationInputError } from "../errors";
import type { IntegrationAnswerValue, IntegrationInput } from "../../interfaces/Integration";
import type { IntegrationImportOptions } from "../../interfaces/IntegrationImport";

export const RESERVED_INPUT_NAMES = new Set(["kind", "answers", "options", "definition"]);

export function parseAnswersBody(value: unknown): Record<string, unknown> | undefined {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }
    const parsed = parseJsonAnswer(value, "answers");
    if (!isRecord(parsed)) {
        throw new IntegrationInputError("answers", "must be an object");
    }
    return parsed;
}

export function parseFlatAnswersBody(body: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(body).filter(([key]) => !RESERVED_INPUT_NAMES.has(key)));
}

export function parseOptions(value: unknown): IntegrationImportOptions {
    if (value === undefined || value === null || value === "") {
        return {};
    }
    const parsed = parseJsonAnswer(value, "options");
    if (!isRecord(parsed)) {
        throw new IntegrationInputError("options", "must be an object");
    }
    const force = parsed.force;
    if (force === undefined) {
        return {};
    }
    if (typeof force !== "boolean") {
        throw new IntegrationInputError("options.force", "must be boolean");
    }
    return { force };
}

export function parseJsonAnswer(value: unknown, name: string): unknown {
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        throw new IntegrationInputError(name, "must be valid JSON");
    }
}

export function booleanAnswer(value: unknown, name: string): boolean {
    if (typeof value === "boolean") {
        return value;
    }
    if (value === 1) {
        return true;
    }
    if (value === 0) {
        return false;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "on", "1"].includes(normalized)) {
            return true;
        }
        if (["false", "off", "0"].includes(normalized)) {
            return false;
        }
    }
    throw new IntegrationInputError(name, "must be boolean");
}

export function validateUrl(name: string, value: string): void {
    const verdict = validateSourceTargetUrl(value);
    if (!verdict.ok) {
        throw new IntegrationInputError(`answers.${name}`, verdict.reason);
    }
}

export const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isInputType(value: string | undefined): value is IntegrationInput["type"] {
    return (
        value === "text" ||
        value === "url" ||
        value === "password" ||
        value === "select" ||
        value === "boolean" ||
        value === "json"
    );
}

export function isJsonValue(value: unknown): value is IntegrationAnswerValue {
    if (value === null) {
        return true;
    }
    if (typeof value === "string" || typeof value === "boolean") {
        return true;
    }
    if (typeof value === "number") {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every(isJsonValue);
    }
    if (isRecord(value)) {
        return Object.values(value).every(isJsonValue);
    }
    return false;
}

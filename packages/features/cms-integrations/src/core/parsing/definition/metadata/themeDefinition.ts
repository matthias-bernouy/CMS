import { IntegrationInputError } from "../../../errors";
import type {
    IntegrationThemeCategory,
    IntegrationThemeDefinition,
    IntegrationThemeToken,
    IntegrationThemeTokenDefaults,
    IntegrationThemeTokenType,
} from "../../../../interfaces/Integration";
import { isRecord, text } from "../values";
import { parseThemeCssValue } from "./cssValue";

const LOCAL_ID = /^[a-z][a-z0-9-]*$/;

export function parseThemeDefinition(value: unknown, integrationKind: string): IntegrationThemeDefinition | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!isRecord(value)) {
        throw new IntegrationInputError("definition.theme", "must be an object");
    }
    assertLocalId(integrationKind, "definition.kind");
    if (!Array.isArray(value.categories) || value.categories.length === 0) {
        throw new IntegrationInputError("definition.theme.categories", "must be a non-empty array");
    }

    const categoryIds = new Set<string>();
    const tokenIds = new Set<string>();
    const categories = value.categories.map((category, index) =>
        parseCategory(category, `definition.theme.categories.${index}`, categoryIds, tokenIds),
    );
    return { categories };
}

export function validateThemeDefinition(theme: IntegrationThemeDefinition, integrationKind: string): void {
    parseThemeDefinition(theme, integrationKind);
}

function parseCategory(
    value: unknown,
    name: string,
    categoryIds: Set<string>,
    tokenIds: Set<string>,
): IntegrationThemeCategory {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const id = requiredText(value.id, `${name}.id`);
    assertLocalId(id, `${name}.id`);
    if (categoryIds.has(id)) {
        throw new IntegrationInputError(`${name}.id`, `duplicate theme category id: ${id}`);
    }
    categoryIds.add(id);
    const label = requiredText(value.label, `${name}.label`);
    if (!Array.isArray(value.tokens) || value.tokens.length === 0) {
        throw new IntegrationInputError(`${name}.tokens`, "must be a non-empty array");
    }
    const tokens = value.tokens.map((token, index) => parseToken(token, `${name}.tokens.${index}`, tokenIds));
    return {
        id,
        label,
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        tokens,
    };
}

function parseToken(value: unknown, name: string, tokenIds: Set<string>): IntegrationThemeToken {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    if (value.variable !== undefined) {
        throw new IntegrationInputError(`${name}.variable`, "must not be declared; the CMS generates it");
    }
    const id = requiredText(value.id, `${name}.id`);
    assertLocalId(id, `${name}.id`);
    if (tokenIds.has(id)) {
        throw new IntegrationInputError(`${name}.id`, `duplicate theme token id: ${id}`);
    }
    tokenIds.add(id);
    const label = requiredText(value.label, `${name}.label`);
    const type = parseTokenType(value.type, `${name}.type`);
    return {
        id,
        label,
        ...(text(value.description) ? { description: text(value.description)! } : {}),
        type,
        defaults: parseDefaults(value.defaults, `${name}.defaults`),
    };
}

function parseDefaults(value: unknown, name: string): IntegrationThemeTokenDefaults {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const light = parseThemeCssValue(value.light, `${name}.light`);
    const dark = value.dark === undefined ? undefined : parseThemeCssValue(value.dark, `${name}.dark`);
    return { light, ...(dark ? { dark } : {}) };
}

function parseTokenType(value: unknown, name: string): IntegrationThemeTokenType {
    if (
        value === "color" ||
        value === "font-family" ||
        value === "length" ||
        value === "number" ||
        value === "shadow" ||
        value === "value"
    ) {
        return value;
    }
    throw new IntegrationInputError(name, "must be color, font-family, length, number, shadow, or value");
}

function assertLocalId(value: string, name: string): void {
    if (!LOCAL_ID.test(value)) {
        throw new IntegrationInputError(name, "must be a lowercase kebab-case identifier");
    }
}

function requiredText(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed) {
        throw new IntegrationInputError(name, "must be a non-empty string");
    }
    return parsed;
}

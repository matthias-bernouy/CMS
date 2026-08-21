import type {
    ThemeCategory,
    ThemeSettings,
    ThemeSource,
    ThemeToken,
    ThemeTokenType,
} from "cms-content/interfaces/theme";

const CORE_TOKEN_TYPES: Readonly<Record<string, ThemeTokenType>> = {
    "font-heading": "font-family",
    "font-body": "font-family",
    "font-size-body": "length",
    "font-size-display": "length",
    "space-sm": "length",
    "space-md": "length",
    "space-xl": "length",
    "content-width": "length",
    "wide-width": "length",
    "radius-control": "length",
    "radius-card": "length",
    "shadow-soft": "shadow",
};

const LEGACY_SOURCE_IDS = new Set([
    "colors",
    "typography",
    "spacing",
    "shape",
    "site-tokens",
    "existing-css",
    "imported-css",
    "other",
]);
const CUSTOM_SOURCE_ID = "custom";
const CUSTOM_CATEGORY_ID = "variables";

export function normalizeThemeCatalog(settings: ThemeSettings): void {
    normalizeLegacyOwners(settings);
    assignSemanticTokenTypes(settings);
    normalizeCustomSource(settings);
    mergeLegacySourcesIntoCustomVariables(settings);
}

function normalizeCustomSource(settings: ThemeSettings): void {
    const source = settings.sources.find((item) => item.id === CUSTOM_SOURCE_ID);
    if (source) {
        source.label = "Site variables";
    }
}

function normalizeLegacyOwners(settings: ThemeSettings): void {
    for (const source of settings.sources) {
        const kind = (source.owner as { kind?: unknown } | undefined)?.kind;
        if (kind === "core" || kind === "site") {
            delete source.owner;
        }
    }
}

function assignSemanticTokenTypes(settings: ThemeSettings): void {
    for (const source of settings.sources) {
        for (const token of source.categories.flatMap((category) => category.tokens)) {
            token.type = CORE_TOKEN_TYPES[token.id] ?? token.type;
        }
    }
}

function mergeLegacySourcesIntoCustomVariables(settings: ThemeSettings): void {
    const legacySources = settings.sources.filter(
        (source) => source.owner?.kind !== "integration" && LEGACY_SOURCE_IDS.has(source.id),
    );
    if (legacySources.length === 0) {
        return;
    }
    const custom = customSource(settings);
    const variables = customCategory(custom);
    for (const source of legacySources) {
        for (const category of source.categories) {
            appendTokens(variables, category.tokens);
        }
    }
    settings.sources = settings.sources.filter((source) => !legacySources.includes(source));
}

function appendTokens(category: ThemeCategory, tokens: ThemeToken[]): void {
    for (const token of tokens) {
        if (!category.tokens.some((item) => item.id === token.id || item.variable === token.variable)) {
            category.tokens.push(token);
        }
    }
}

function customSource(settings: ThemeSettings): ThemeSource {
    const current = settings.sources.find((source) => source.id === CUSTOM_SOURCE_ID);
    if (current) {
        return current;
    }
    const source: ThemeSource = {
        id: CUSTOM_SOURCE_ID,
        label: "Site variables",
        supportsModes: true,
        categories: [],
    };
    settings.sources.unshift(source);
    return source;
}

function customCategory(source: ThemeSource): ThemeCategory {
    const current = source.categories.find((category) => category.id === CUSTOM_CATEGORY_ID);
    if (current) {
        return current;
    }
    const category: ThemeCategory = {
        id: CUSTOM_CATEGORY_ID,
        label: "Variables",
        description: "Variables created by this site and reusable by installed integrations.",
        tokens: [],
    };
    source.categories.unshift(category);
    return category;
}

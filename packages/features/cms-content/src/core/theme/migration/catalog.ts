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

const CORE_SOURCE_IDS = new Set(["colors", "typography", "spacing", "shape"]);
const LEGACY_CUSTOM_TOKEN_ID = /^custom-\d+(?:-\d+)?$/;

export function normalizeThemeCatalog(settings: ThemeSettings): void {
    const site = ensureSiteTokenSource(settings);
    migrateLegacyCustomCatalog(settings, site);
    normalizeImportedCssSource(settings);
    assignSemanticTokenTypes(settings);
    assignLegacySourceOwners(settings);
}

function ensureSiteTokenSource(settings: ThemeSettings): ThemeSource {
    let source = settings.sources.find((item) => item.id === "site-tokens");
    if (!source) {
        source = {
            id: "site-tokens",
            label: "Site tokens",
            supportsModes: true,
            owner: { kind: "site" },
            categories: [],
        };
        settings.sources.push(source);
    }
    source.label = "Site tokens";
    source.supportsModes = true;
    source.owner = { kind: "site" };
    ensureGeneralCategory(source);
    return source;
}

function migrateLegacyCustomCatalog(settings: ThemeSettings, site: ThemeSource): void {
    for (const source of settings.sources) {
        if (source === site || source.owner?.kind === "integration" || source.id.startsWith("integration-")) {
            continue;
        }
        const categoryPrefix = `${source.id}-category-`;
        const customCategories = source.categories.filter((category) => category.id.startsWith(categoryPrefix));
        source.categories = source.categories.filter((category) => !category.id.startsWith(categoryPrefix));
        for (const category of customCategories) {
            appendCategory(site, category);
        }
        for (const category of source.categories) {
            const customTokens = category.tokens.filter((token) => LEGACY_CUSTOM_TOKEN_ID.test(token.id));
            category.tokens = category.tokens.filter((token) => !LEGACY_CUSTOM_TOKEN_ID.test(token.id));
            appendTokens(ensureGeneralCategory(site), customTokens);
        }
    }
}

function normalizeImportedCssSource(settings: ThemeSettings): void {
    const legacy = settings.sources.find((source) => source.id === "other");
    let imported = settings.sources.find((source) => source.id === "imported-css");
    if (!imported && legacy) {
        legacy.id = "imported-css";
        imported = legacy;
    } else if (imported && legacy) {
        for (const category of legacy.categories) {
            appendCategory(imported, category);
        }
        settings.sources = settings.sources.filter((source) => source !== legacy);
    }
    if (!imported) {
        return;
    }
    imported.label = "Imported CSS";
    imported.supportsModes = false;
    imported.owner = { kind: "site" };
    const general = imported.categories.find((category) => category.id === "general");
    if (general?.label === "General") {
        general.label = "Imported variables";
    }
}

function assignSemanticTokenTypes(settings: ThemeSettings): void {
    for (const source of settings.sources.filter((item) => CORE_SOURCE_IDS.has(item.id))) {
        for (const token of source.categories.flatMap((category) => category.tokens)) {
            token.type = CORE_TOKEN_TYPES[token.id] ?? token.type;
        }
    }
}

function assignLegacySourceOwners(settings: ThemeSettings): void {
    for (const source of settings.sources) {
        source.owner ??= { kind: CORE_SOURCE_IDS.has(source.id) ? "core" : "site" };
    }
}

function appendCategory(source: ThemeSource, category: ThemeCategory): void {
    const current = source.categories.find((item) => item.id === category.id);
    if (current) {
        appendTokens(current, category.tokens);
        return;
    }
    source.categories.push(category);
}

function appendTokens(category: ThemeCategory, tokens: ThemeToken[]): void {
    for (const token of tokens) {
        if (!category.tokens.some((item) => item.id === token.id || item.variable === token.variable)) {
            category.tokens.push(token);
        }
    }
}

function ensureGeneralCategory(source: ThemeSource): ThemeCategory {
    let category = source.categories.find((item) => item.id === "general");
    if (!category) {
        category = { id: "general", label: "General", description: "Design tokens created for this site.", tokens: [] };
        source.categories.unshift(category);
    }
    return category;
}

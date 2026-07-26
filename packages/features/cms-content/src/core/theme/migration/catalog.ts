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
const LEGACY_THEME_SOURCE_ID = "site-tokens";

export function normalizeThemeCatalog(settings: ThemeSettings): void {
    normalizeLegacyOwners(settings);
    normalizeLegacyThemeSource(settings);
    normalizeImportedCssSource(settings);
    assignSemanticTokenTypes(settings);
}

function normalizeLegacyOwners(settings: ThemeSettings): void {
    for (const source of settings.sources) {
        const kind = (source.owner as { kind?: unknown } | undefined)?.kind;
        if (kind === "core" || kind === "site") {
            delete source.owner;
        }
    }
}

function normalizeLegacyThemeSource(settings: ThemeSettings): void {
    const source = settings.sources.find((item) => item.id === LEGACY_THEME_SOURCE_ID);
    if (!source || source.owner?.kind === "integration") {
        return;
    }
    if (source.label === "Site tokens") {
        source.label = "Theme tokens";
    }
    for (const category of source.categories) {
        if (category.description === "Design tokens created for this site.") {
            category.description = "Theme design tokens.";
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
    delete imported.owner;
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

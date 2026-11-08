import type { ThemeSettings, ThemeToken } from "content/theme/interfaces/theme";

export function allTokens(settings: ThemeSettings): ThemeToken[] {
    return settings.sources.flatMap((source) => source.categories.flatMap((category) => category.tokens));
}

export {
    canReferenceThemeToken,
    effectiveTokenValue,
    resolveThemeTokenValue,
    themeReferenceCycles,
    themeTokenEntries,
    type ResolvedThemeValue,
    type ThemeTokenEntry,
} from "content/theme/core/tokens/values";
export {
    directTokenReference,
    parseDirectTokenReference,
    type DirectTokenReference,
} from "content/theme/core/tokens/references";

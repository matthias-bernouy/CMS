import type { ThemeSettings, ThemeToken } from "cms-content/interfaces/theme";

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
} from "./values";
export { directTokenReference, parseDirectTokenReference, type DirectTokenReference } from "./references";

import type { ThemeSettings, ThemeToken } from "cms-content/interfaces/theme";

export function allTokens(settings: ThemeSettings): ThemeToken[] {
    return settings.sources.flatMap((source) => source.categories.flatMap((category) => category.tokens));
}

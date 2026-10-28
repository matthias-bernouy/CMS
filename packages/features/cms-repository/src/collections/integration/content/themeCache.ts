import type { ThemeSettings } from "@bernouy/cms-content";
import type { CollectionRelease } from "@bernouy/cms-repository/collections";
import { composeCollectionThemes } from "./theme";

/** Cache pure composition only; callers still read current site settings and collection revisions. */
export function createCollectionThemeComposer() {
    let cached: { revision: number; base: string; theme: ThemeSettings } | undefined;
    return (base: ThemeSettings, revision: number, releases: readonly CollectionRelease[]): ThemeSettings => {
        const key = JSON.stringify(base);
        if (cached?.revision === revision && cached.base === key) {
            return structuredClone(cached.theme);
        }
        const theme = composeCollectionThemes(base, releases);
        // One bounded projection per repository instance, with no credentials or access decisions.
        cached =
            key.length + JSON.stringify(theme).length <= 1024 * 1024
                ? { revision, base: key, theme: structuredClone(theme) }
                : undefined;
        return theme;
    };
}

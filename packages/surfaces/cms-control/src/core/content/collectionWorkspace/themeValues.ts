import {
    effectiveTokenValue,
    resolveThemeTokenValue,
    themeTokenEntries,
    type ThemeSettings,
    type ThemeTokenDefaults,
} from "@bernouy/cms-content/theme";
import type { CollectionThemeTokenView } from "./types";

type ProjectedThemeValues = Pick<
    CollectionThemeTokenView,
    | "light"
    | "dark"
    | "lightResolved"
    | "darkResolved"
    | "lightReference"
    | "darkReference"
    | "lightReferenceLabel"
    | "darkReferenceLabel"
    | "lightOverridden"
    | "darkOverridden"
    | "darkUsesLight"
    | "lightIssue"
    | "darkIssue"
>;

export function projectThemeValues(
    settings: ThemeSettings,
    variable: string,
    defaults: ThemeTokenDefaults,
    themeId = settings.activeThemeId,
): ProjectedThemeValues {
    const theme = settings.themes.find(({ id }) => id === themeId);
    const entry = themeTokenEntries(settings).find(({ token }) => token.variable === variable);
    if (!theme || !entry) {
        const light = defaults.light ?? "";
        const dark = defaults.dark ?? light;
        return {
            light,
            dark,
            lightResolved: light,
            darkResolved: dark,
            lightOverridden: false,
            darkOverridden: false,
            darkUsesLight: defaults.dark === undefined,
        };
    }

    const light = resolveThemeTokenValue(settings, theme, "light", entry.token.id);
    const dark = resolveThemeTokenValue(settings, theme, "dark", entry.token.id);
    return {
        light: effectiveTokenValue(entry.token, theme, "light"),
        dark: effectiveTokenValue(entry.token, theme, "dark"),
        lightResolved: light.value,
        darkResolved: dark.value,
        ...(light.reference
            ? {
                  lightReference: light.reference.token.variable,
                  lightReferenceLabel: light.reference.token.label,
              }
            : {}),
        ...(dark.reference
            ? {
                  darkReference: dark.reference.token.variable,
                  darkReferenceLabel: dark.reference.token.label,
              }
            : {}),
        lightOverridden: theme.values.light?.[entry.token.id] !== undefined,
        darkOverridden: theme.values.dark?.[entry.token.id] !== undefined,
        darkUsesLight: theme.values.dark?.[entry.token.id] === undefined && entry.token.defaults?.dark === undefined,
        ...(issue(light.state) ? { lightIssue: issue(light.state) } : {}),
        ...(issue(dark.state) ? { darkIssue: issue(dark.state) } : {}),
    };
}

function issue(state: "literal" | "resolved" | "missing" | "cycle"): string | undefined {
    return state === "missing"
        ? "The referenced token is unavailable."
        : state === "cycle"
          ? "This reference creates a cycle."
          : undefined;
}

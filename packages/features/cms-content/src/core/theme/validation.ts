import { ContentValidationError } from "cms-content/core/errors";
import { allTokens } from "cms-content/core/theme/tokens";
import type { ThemeSettings } from "cms-content/interfaces/theme";

export function validateThemeSettings(settings: ThemeSettings): ThemeSettings {
    if (!settings || typeof settings !== "object") throw new ContentValidationError("theme", "expected an object.");
    const tokenIds = new Set<string>();
    const variables = new Set<string>();
    for (const item of allTokens(settings)) {
        assertIdentifier("theme token id", item.id);
        assertIdentifier("theme CSS variable", item.variable);
        if (tokenIds.has(item.id)) throw new ContentValidationError("theme", `duplicate token id: ${item.id}`);
        if (variables.has(item.variable)) throw new ContentValidationError("theme", `duplicate CSS variable: ${item.variable}`);
        tokenIds.add(item.id);
        variables.add(item.variable);
    }
    const themeIds = new Set<string>();
    for (const theme of settings.themes) {
        assertIdentifier("theme id", theme.id);
        if (themeIds.has(theme.id)) throw new ContentValidationError("theme", `duplicate theme id: ${theme.id}`);
        themeIds.add(theme.id);
        for (const mode of ["light", "dark"] as const) {
            for (const [tokenId, value] of Object.entries(theme.values?.[mode] ?? {})) {
                if (!tokenIds.has(tokenId)) throw new ContentValidationError("theme", `unknown token: ${tokenId}`);
                if (typeof value !== "string" || /[;{}\u0000-\u001f]/.test(value)) {
                    throw new ContentValidationError("theme", `invalid CSS value for token: ${tokenId}`);
                }
            }
        }
    }
    if (!themeIds.has(settings.activeThemeId)) throw new ContentValidationError("theme", "active theme does not exist.");
    return structuredClone(settings);
}

function assertIdentifier(field: string, value: string): void {
    if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new ContentValidationError("theme", `${field} is invalid: ${value}`);
}

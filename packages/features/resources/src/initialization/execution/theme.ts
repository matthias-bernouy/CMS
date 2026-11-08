import { validateThemeSettings } from "@bernouy/content";
import type { ThemeSettings } from "@bernouy/content";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { resourceInitializationError } from "../state";

/** Add ordinary defaults while retaining the site's selected theme and configured values. */
export function mergeResourceTheme(current: ThemeSettings, incoming: ThemeSettings | null): ThemeSettings {
    const next = structuredClone(current);
    if (!incoming) {
        return validateThemeSettings(next);
    }
    for (const source of incoming.sources) {
        const existing = next.sources.find((item) => item.id === source.id);
        if (existing && canonicalizeIJson(existing) !== canonicalizeIJson(source)) {
            throw resourceInitializationError("Resource theme source conflicts with existing settings", 409);
        }
        if (!existing) {
            next.sources.push(structuredClone(source));
        }
    }
    for (const theme of incoming.themes) {
        const existing = next.themes.find((item) => item.id === theme.id);
        if (!existing) {
            next.themes.push(structuredClone(theme));
            continue;
        }
        for (const mode of ["light", "dark"] as const) {
            for (const [id, value] of Object.entries(theme.values[mode])) {
                if (Object.hasOwn(existing.values[mode], id) && existing.values[mode][id] !== value) {
                    throw resourceInitializationError("Resource theme values conflict with site configuration", 409);
                }
                existing.values[mode][id] = value;
            }
        }
    }
    return validateThemeSettings(next);
}

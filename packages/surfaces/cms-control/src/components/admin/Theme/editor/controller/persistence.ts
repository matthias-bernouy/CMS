import { saveThemeSettings } from "../api";
import { themeReferenceCycles } from "../tokens/values";
import { setThemeMessage } from "../view";
import type { ThemeEditorState } from "./state";

export async function persistTheme(
    root: ShadowRoot | null,
    state: ThemeEditorState,
    activate: boolean,
    afterSave: () => void | Promise<void>,
): Promise<void> {
    const settings = state.settings;
    if (!settings) {
        return;
    }
    const cycles = new Set(
        settings.themes.flatMap((theme) => [
            ...themeReferenceCycles(settings, theme, "light"),
            ...themeReferenceCycles(settings, theme, "dark"),
        ]),
    );
    if (cycles.size > 0) {
        setThemeMessage(root, `Circular token references: ${[...cycles].join(", ")}.`, true);
        return;
    }
    const submitted = activate ? { ...settings, activeThemeId: state.selectedThemeId } : settings;
    setThemeMessage(root, "Saving…");
    root?.host.toggleAttribute("inert", true);
    root?.host.setAttribute("aria-busy", "true");
    try {
        try {
            await saveThemeSettings(submitted);
        } catch (error) {
            setThemeMessage(root, error instanceof Error ? error.message : "Unable to save theme", true);
            return;
        }
        try {
            await afterSave();
            setThemeMessage(root, activate ? "Theme activated." : "Theme saved.");
        } catch {
            setThemeMessage(root, "Theme saved, but the editor could not refresh. Reload this page.", true);
        }
    } finally {
        root?.host.removeAttribute("inert");
        root?.host.removeAttribute("aria-busy");
    }
}

import { saveThemeSettings } from "../api";
import { themeReferenceCycles } from "../tokens/values";
import { setThemeMessage } from "../view";
import type { ThemeEditorState } from "./state";

export async function persistTheme(
    root: ShadowRoot | null,
    state: ThemeEditorState,
    activate: boolean,
    afterSave: () => void,
): Promise<void> {
    const settings = state.settings;
    if (!settings || !state.canPersist) {
        return;
    }
    const theme = settings.themes.find((item) => item.id === state.selectedThemeId);
    const cycles = theme
        ? new Set([...themeReferenceCycles(settings, theme, "light"), ...themeReferenceCycles(settings, theme, "dark")])
        : new Set<string>();
    if (cycles.size > 0) {
        setThemeMessage(root, `Circular token references: ${[...cycles].join(", ")}.`, true);
        return;
    }
    if (activate) {
        settings.activeThemeId = state.selectedThemeId;
    }
    setThemeMessage(root, "Saving…");
    try {
        await saveThemeSettings(settings);
        setThemeMessage(root, activate ? "Theme activated." : "Theme saved.");
        afterSave();
    } catch (error) {
        setThemeMessage(root, error instanceof Error ? error.message : "Unable to save theme", true);
    }
}

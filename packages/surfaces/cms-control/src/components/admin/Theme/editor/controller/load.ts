import { loadThemeSettings } from "../api";
import { setThemeMessage } from "../view";
import type { ThemeEditorState } from "./state";

export async function loadThemeEditor(
    root: ShadowRoot | null,
    state: ThemeEditorState,
    render: () => void,
    afterLoad: () => void,
): Promise<void> {
    setThemeMessage(root, "Loading theme…");
    try {
        state.applyLoaded(await loadThemeSettings());
        render();
        setThemeMessage(
            root,
            state.canPersist ? "" : "Restart the Control server to enable theme persistence.",
            !state.canPersist,
        );
        afterLoad();
    } catch (error) {
        setThemeMessage(root, error instanceof Error ? error.message : "Unable to load theme", true);
    }
}

export const THEME_TOKEN_DRAFT_EVENT = "cms:theme-token-draft";
export const THEME_TOKEN_EDITOR_STATE_EVENT = "cms:theme-token-editor-state";
export const THEME_WORKSPACE_RELOAD_EVENT = "theme:changed";

export type ThemeTokenDraft = { variable: string; light: string; dark: string };
export type ThemeTokenEditorState = { dirty: boolean; saving: boolean };

export function themeModeFromEvent(event: Event): "light" | "dark" {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest<HTMLElement>("[data-theme-mode]")?.dataset.themeMode === "dark" ? "dark" : "light";
}

export function emitThemeEditingEvent<T>(host: HTMLElement, type: string, detail: T): void {
    host.dispatchEvent(new CustomEvent<T>(type, { bubbles: true, composed: true, detail }));
}

export type ThemeEditorHandlers = {
    click: EventListener;
    change: EventListener;
    input: EventListener;
    keydown: EventListener;
    selection: EventListener;
};

export function addThemeEditorListeners(
    root: ShadowRoot | null,
    selectionEvent: string,
    handlers: ThemeEditorHandlers,
): void {
    root?.addEventListener("click", handlers.click);
    root?.addEventListener("change", handlers.change);
    root?.addEventListener("input", handlers.input);
    root?.addEventListener("keydown", handlers.keydown);
    window.addEventListener(selectionEvent, handlers.selection);
}

export function removeThemeEditorListeners(
    root: ShadowRoot | null,
    selectionEvent: string,
    handlers: ThemeEditorHandlers,
): void {
    root?.removeEventListener("click", handlers.click);
    root?.removeEventListener("change", handlers.change);
    root?.removeEventListener("input", handlers.input);
    root?.removeEventListener("keydown", handlers.keydown);
    window.removeEventListener(selectionEvent, handlers.selection);
}

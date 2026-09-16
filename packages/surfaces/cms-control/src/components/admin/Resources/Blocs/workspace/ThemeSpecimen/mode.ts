export type PreviewMode = "compare" | "light" | "dark";

const MODES = new Set<PreviewMode>(["compare", "light", "dark"]);
const STORAGE_KEY = "cms:collection-theme-preview-mode";

export function isPreviewMode(value: string | undefined): value is PreviewMode {
    return Boolean(value && MODES.has(value as PreviewMode));
}

export function initialPreviewMode(): PreviewMode {
    const stored = sessionStorage.getItem(STORAGE_KEY) ?? undefined;
    if (isPreviewMode(stored)) {
        return stored;
    }
    return matchMedia("(max-width: 720px)").matches ? "light" : "compare";
}

export function applyPreviewMode(host: HTMLElement, panels: HTMLElement[], mode: PreviewMode, persist: boolean): void {
    host.dataset.mode = mode;
    if (persist) {
        sessionStorage.setItem(STORAGE_KEY, mode);
    }
    for (const button of Array.from(host.shadowRoot!.querySelectorAll<HTMLElement>("[data-preview-mode]"))) {
        button.setAttribute("aria-pressed", String(button.dataset.previewMode === mode));
    }
    const sharedFocusValue = host.dataset.previewView === "focus" && host.hasAttribute("data-shared-value");
    for (const panel of panels) {
        const panelMode = panel.dataset.themePanel;
        const visible = mode === "compare" ? !sharedFocusValue || panelMode === "light" : mode === panelMode;
        panel.toggleAttribute("hidden", !visible);
        const label = panel.querySelector<HTMLElement>(".mode-label");
        if (label) {
            label.textContent =
                mode === "compare" && sharedFocusValue && panelMode === "light"
                    ? "Light and dark"
                    : panelMode === "light"
                      ? "Light"
                      : "Dark";
        }
    }
}

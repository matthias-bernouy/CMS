import {
    effectiveTokenValue,
    parseDirectTokenReference,
    resolveThemeTokenValue,
    themeTokenEntries,
    type ThemeDefinition,
    type ThemeMode,
    type ThemeSettings,
    type ThemeTokenEntry,
} from "@bernouy/cms-content/theme";
import { renderTokenControls } from "cms-control/components/admin/Theme/editor/tokens/controls";

export type TokenEditorContext = {
    entry: ThemeTokenEntry;
    settings: ThemeSettings;
    theme: ThemeDefinition;
};

export function renderTokenEditor(
    root: ShadowRoot,
    settings: ThemeSettings,
    variable: string,
    themeId = settings.activeThemeId,
): TokenEditorContext | undefined {
    const entry = themeTokenEntries(settings).find(({ token }) => token.variable === variable);
    const theme = settings.themes.find(({ id }) => id === themeId);
    const editor = query<HTMLElement>(root, "[data-editor]");
    if (!entry || !theme) {
        editor.hidden = true;
        setEditorStatus(root, "This value is unavailable.", true);
        return undefined;
    }
    editor.hidden = false;
    for (const mode of ["light", "dark"] as const) {
        renderMode(root, settings, theme, entry, mode);
    }
    return { entry, settings, theme };
}

export function setEditorStatus(root: ShadowRoot, message: string, error = false): void {
    const status = query<HTMLElement>(root, "[data-status]");
    status.textContent = message;
    status.hidden = !message;
    status.toggleAttribute("data-error", error);
}

function renderMode(
    root: ShadowRoot,
    settings: ThemeSettings,
    theme: ThemeDefinition,
    entry: ThemeTokenEntry,
    mode: ThemeMode,
): void {
    const container = query<HTMLElement>(root, `[data-mode-controls="${mode}"]`);
    const controls = renderTokenControls(entry.token, settings, theme, mode);
    controls.dataset.tokenId = entry.token.id;
    container.replaceChildren(controls);

    const customized = Object.hasOwn(theme.values[mode] ?? {}, entry.token.id);
    const status = query<HTMLElement>(root, `[data-mode-status="${mode}"]`);
    status.textContent = customized ? "Customized" : "Default";
    status.toggleAttribute("data-customized", customized);

    const value = effectiveTokenValue(entry.token, theme, mode);
    const resolved = resolveThemeTokenValue(settings, theme, mode, entry.token.id);
    const resolvedValue = query<HTMLElement>(root, `[data-resolved-value="${mode}"]`);
    resolvedValue.textContent = resolved.value;
    resolvedValue.hidden = !parseDirectTokenReference(value);
    resolvedValue.toggleAttribute("data-error", resolved.state === "missing" || resolved.state === "cycle");

    if (mode === "dark") {
        const fallback = query<HTMLElement>(root, "[data-dark-fallback]");
        const usesLightValue = !customized && entry.token.defaults?.dark === undefined;
        fallback.hidden = !usesLightValue;
        container.hidden = usesLightValue;
        status.closest("header")!.hidden = usesLightValue;
    }
}

function query<T extends Element>(root: ParentNode, selector: string): T {
    return root.querySelector(selector) as T;
}

import type { ThemeSettings } from "@bernouy/cms-content/theme";
import { adminSystemSettingsStore } from "cms-control/components/admin/Common/SystemSettings/store";
import { dispatchThemeSettingsRefreshed } from "cms-control/components/admin/Theme/events";
import { saveThemeDraft } from "cms-control/components/admin/Theme/editor/controller/persistence";
import { THEME_WORKSPACE_RELOAD_EVENT } from "./events";

export async function loadThemeEditingDraft(): Promise<ThemeSettings> {
    return structuredClone((await adminSystemSettingsStore.load()).theme);
}

export async function persistThemeEditingDraft(settings: ThemeSettings, document: Document): Promise<ThemeSettings> {
    await saveThemeDraft(settings);
    adminSystemSettingsStore.invalidate();
    const reloaded = await loadThemeEditingDraft();
    dispatchThemeSettingsRefreshed();
    document.dispatchEvent(new Event(THEME_WORKSPACE_RELOAD_EVENT));
    return reloaded;
}

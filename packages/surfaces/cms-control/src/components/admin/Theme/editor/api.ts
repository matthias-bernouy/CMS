import type { ThemeSettings } from "@bernouy/cms-content";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

type SettingsResponse = { site: { name: string }; theme: ThemeSettings };

export type LoadedThemeSettings = {
    settings: ThemeSettings;
    siteName: string;
    canPersist: boolean;
};

export async function loadThemeSettings(): Promise<LoadedThemeSettings> {
    const response = await fetch(`${getMetaBasePath()}/api/system/settings`, {
        headers: { Accept: "application/json" },
    });
    if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
    }
    const data = (await response.json()) as SettingsResponse;
    return {
        canPersist: true,
        settings: structuredClone(data.theme),
        siteName: data.site.name,
    };
}

export async function saveThemeSettings(settings: ThemeSettings): Promise<void> {
    const response = await fetch(`${getMetaBasePath()}/api/system/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ theme: settings }),
    });
    if (!response.ok) {
        throw new Error((await response.text()) || `Request failed (${response.status})`);
    }
}

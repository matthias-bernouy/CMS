import type { ThemeSettings } from "@bernouy/cms-content";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

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

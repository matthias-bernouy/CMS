import type { ThemeSettings } from "@bernouy/cms-content";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

type SettingsResponse = {
    site?: { name?: string };
    theme?: ThemeSettings;
};

export type ThemePageSnapshot = {
    settings: ThemeSettings;
    siteName: string;
};

class ThemePageStore {
    private snapshot: ThemePageSnapshot | undefined;
    private pending: Promise<ThemePageSnapshot> | undefined;

    load(): Promise<ThemePageSnapshot> {
        if (this.snapshot) {
            return Promise.resolve(this.snapshot);
        }
        this.pending ??= this.fetchSnapshot();
        return this.pending;
    }

    invalidate(): void {
        this.snapshot = undefined;
    }

    private async fetchSnapshot(): Promise<ThemePageSnapshot> {
        try {
            const response = await fetch(`${getMetaBasePath()}/api/system/settings`, {
                headers: { Accept: "application/json" },
            });
            if (!response.ok) {
                throw new Error(`Request failed (${response.status})`);
            }
            const data = (await response.json()) as SettingsResponse;
            if (!data.theme) {
                throw new Error("Theme settings are unavailable.");
            }
            this.snapshot = {
                settings: data.theme,
                siteName: data.site?.name ?? "",
            };
            return this.snapshot;
        } finally {
            this.pending = undefined;
        }
    }
}

export const themePageStore = new ThemePageStore();

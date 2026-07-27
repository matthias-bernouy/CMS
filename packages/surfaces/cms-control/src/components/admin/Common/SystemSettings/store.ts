import type { ThemeSettings, TSystem } from "@bernouy/cms-content";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

export type AdminSystemSettings = Pick<TSystem, "site" | "theme">;

class AdminSystemSettingsStore {
    private snapshot: AdminSystemSettings | undefined;
    private pending: Promise<AdminSystemSettings> | undefined;
    private revision = 0;

    load(): Promise<AdminSystemSettings> {
        if (this.snapshot) {
            return Promise.resolve(this.snapshot);
        }
        this.pending ??= this.fetchSnapshot(this.revision);
        return this.pending;
    }

    invalidate(): void {
        this.revision += 1;
        this.snapshot = undefined;
        this.pending = undefined;
    }

    private async fetchSnapshot(revision: number): Promise<AdminSystemSettings> {
        try {
            const response = await fetch(`${getMetaBasePath()}/api/system/settings`, {
                headers: { Accept: "application/json" },
            });
            if (revision !== this.revision) {
                return this.load();
            }
            if (!response.ok) {
                throw new Error(`Request failed (${response.status})`);
            }
            const data = (await response.json()) as {
                site?: { name?: unknown };
                theme?: ThemeSettings;
            } | null;
            if (revision !== this.revision) {
                return this.load();
            }
            if (
                !data?.site ||
                typeof data.site.name !== "string" ||
                !data.theme ||
                typeof data.theme.activeThemeId !== "string" ||
                !Array.isArray(data.theme.sources) ||
                !Array.isArray(data.theme.themes)
            ) {
                throw new Error("System settings are unavailable.");
            }
            this.snapshot = { site: data.site as TSystem["site"], theme: data.theme };
            return this.snapshot;
        } catch (error) {
            if (revision !== this.revision) {
                return this.load();
            }
            throw error;
        } finally {
            if (revision === this.revision) {
                this.pending = undefined;
            }
        }
    }
}

export const adminSystemSettingsStore = new AdminSystemSettingsStore();

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TPageRef, TSystem } from "@bernouy/cms-shared";

const SYSTEM_FILE = "system.json";
const THEME_FILE  = "theme.css";

/**
 * Filesystem-backed system store. `system.json` carries the structured
 * config; `theme.css` carries the raw CSS. They're kept apart on disk so
 * the user can edit theme rules without manually quoting them as a JSON
 * string. The repo merges them back into a single `TSystem` for callers.
 */
export class SystemStore {
    constructor(private readonly siteDir: string) {}

    async get(): Promise<TSystem> {
        const json = await this._readJson();
        const theme = await this._readTheme();
        return {
            initializationStep: 1,
            site: {
                name:        json.site?.name        ?? "",
                favicon:     json.site?.favicon     ?? "",
                visible:     json.site?.visible     ?? true,
                host:        json.site?.host        ?? "",
                language:    json.site?.language    ?? "",
                theme:       theme,
                notFound:    coercePageRef(json.site?.notFound),
                serverError: coercePageRef(json.site?.serverError),
            },
            editor: {
                layoutCategory: json.editor?.layoutCategory ?? "",
            },
            security: {
                connectExtras: Array.isArray(json.security?.connectExtras) ? json.security.connectExtras : [],
                mediaExtras:   Array.isArray(json.security?.mediaExtras)   ? json.security.mediaExtras   : [],
            },
        };
    }

    async update(patch: Partial<TSystem>): Promise<TSystem> {
        const current = await this.get();
        const merged: TSystem = {
            initializationStep: patch.initializationStep ?? current.initializationStep,
            site:               { ...current.site,     ...(patch.site     ?? {}) },
            editor:             { ...current.editor,   ...(patch.editor   ?? {}) },
            security:           { ...current.security, ...(patch.security ?? {}) },
        };
        await this._writeJson(merged);
        if (typeof patch.site?.theme === "string") await this._writeTheme(patch.site.theme);
        return merged;
    }

    private async _readJson(): Promise<{ site?: any; editor?: any; security?: any }> {
        const file = join(this.siteDir, SYSTEM_FILE);
        if (!existsSync(file)) return {};
        try { return JSON.parse(await readFile(file, "utf-8")); }
        catch { return {}; }
    }

    private async _readTheme(): Promise<string> {
        const file = join(this.siteDir, THEME_FILE);
        if (!existsSync(file)) return "";
        return await readFile(file, "utf-8");
    }

    private async _writeJson(system: TSystem): Promise<void> {
        await mkdir(this.siteDir, { recursive: true });
        const { theme: _, ...site } = system.site;
        const body = JSON.stringify({ site, editor: system.editor, security: system.security }, null, 4) + "\n";
        await writeFile(join(this.siteDir, SYSTEM_FILE), body, "utf-8");
    }

    private async _writeTheme(theme: string): Promise<void> {
        await mkdir(this.siteDir, { recursive: true });
        await writeFile(join(this.siteDir, THEME_FILE), theme, "utf-8");
    }
}

function coercePageRef(raw: unknown): TPageRef {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw === "string") return { path: raw };
    if (typeof raw === "object" && raw !== null && "path" in raw) {
        const path = (raw as { path: unknown }).path;
        return typeof path === "string" && path !== "" ? { path } : null;
    }
    return null;
}

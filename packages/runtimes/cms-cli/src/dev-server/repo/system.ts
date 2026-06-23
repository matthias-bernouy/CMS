import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TSystem } from "@bernouy/cms-content";
import { coercePageRef, defaultSystem, mergeSystemUpdate } from "@bernouy/cms-content";

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
        const base = defaultSystem();
        return mergeSystemUpdate(base, {
            initializationStep: typeof json.initializationStep === "number" ? json.initializationStep : 1,
            site: {
                name:        typeof json.site?.name        === "string"  ? json.site.name        : base.site.name,
                favicon:     typeof json.site?.favicon     === "string"  ? json.site.favicon     : base.site.favicon,
                visible:     typeof json.site?.visible     === "boolean" ? json.site.visible     : base.site.visible,
                host:        typeof json.site?.host        === "string"  ? json.site.host        : base.site.host,
                language:    typeof json.site?.language    === "string"  ? json.site.language    : base.site.language,
                theme:       theme,
                notFound:    coercePageRef(json.site?.notFound),
                serverError: coercePageRef(json.site?.serverError),
            },
            editor: {
                layoutCategory: typeof json.editor?.layoutCategory === "string" ? json.editor.layoutCategory : base.editor.layoutCategory,
            },
            security: {
                connectExtras: Array.isArray(json.security?.connectExtras) ? json.security.connectExtras : base.security.connectExtras,
                mediaExtras:   Array.isArray(json.security?.mediaExtras)   ? json.security.mediaExtras   : base.security.mediaExtras,
            },
        });
    }

    async update(patch: Partial<TSystem>): Promise<TSystem> {
        const current = await this.get();
        const merged = mergeSystemUpdate(current, patch);
        await this._writeJson(merged);
        if (typeof patch.site?.theme === "string") await this._writeTheme(patch.site.theme);
        return merged;
    }

    private async _readJson(): Promise<{ initializationStep?: any; site?: any; editor?: any; security?: any }> {
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

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
            email: {
                enabled:   typeof json.email?.enabled   === "boolean" ? json.email.enabled   : base.email.enabled,
                fromEmail: typeof json.email?.fromEmail === "string"  ? json.email.fromEmail : base.email.fromEmail,
                fromName:  typeof json.email?.fromName  === "string"  ? json.email.fromName  : base.email.fromName,
                replyTo:   typeof json.email?.replyTo   === "string"  ? json.email.replyTo   : base.email.replyTo,
                transport: json.email?.transport === "smtp" ? json.email.transport : base.email.transport,
                smtp:      {
                    host:              typeof json.email?.smtp?.host              === "string"  ? json.email.smtp.host              : base.email.smtp.host,
                    port:              typeof json.email?.smtp?.port              === "number"  ? json.email.smtp.port              : base.email.smtp.port,
                    secure:            typeof json.email?.smtp?.secure            === "boolean" ? json.email.smtp.secure            : base.email.smtp.secure,
                    username:          typeof json.email?.smtp?.username          === "string"  ? json.email.smtp.username          : base.email.smtp.username,
                    passwordSecretRef: typeof json.email?.smtp?.passwordSecretRef === "string"  ? json.email.smtp.passwordSecretRef : base.email.smtp.passwordSecretRef,
                },
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

    private async _readJson(): Promise<{ initializationStep?: any; site?: any; editor?: any; security?: any; email?: any }> {
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
        const body = JSON.stringify({ site, editor: system.editor, security: system.security, email: system.email }, null, 4) + "\n";
        await writeFile(join(this.siteDir, SYSTEM_FILE), body, "utf-8");
    }

    private async _writeTheme(theme: string): Promise<void> {
        await mkdir(this.siteDir, { recursive: true });
        await writeFile(join(this.siteDir, THEME_FILE), theme, "utf-8");
    }
}

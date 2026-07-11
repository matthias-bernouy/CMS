import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TPageRef, TSystem } from "@bernouy/cms-content";

/** Subset of `TSystem` actually pushable from disk. */
export type SystemPayload = {
    site:   Partial<TSystem["site"]>;
    editor: Partial<TSystem["editor"]>;
};

export type LocalSystem = {
    payload:  SystemPayload;
    hash:     string;
    /** Paths referenced by system pages — drive forward-compat validation. */
    pageRefs: string[];
};

const SYSTEM_FILE = "system.json";
const THEME_FILE  = "theme.css";

/**
 * Read `<siteDir>/system.json` (optional) + inline `<siteDir>/theme.css` (optional)
 * into `site.theme`. Returns `null` when neither file exists — the caller
 * decides whether to skip the stage.
 */
export async function scanSystem(siteDir: string): Promise<LocalSystem | null> {
    const systemPath = join(siteDir, SYSTEM_FILE);
    const themePath  = join(siteDir, THEME_FILE);

    const hasSystem = existsSync(systemPath);
    const hasTheme  = existsSync(themePath);
    if (!hasSystem && !hasTheme) return null;

    const raw: Partial<SystemPayload> = hasSystem ? await readJson(systemPath) : {};
    const payload: SystemPayload = {
        site:   raw.site   ?? {},
        editor: raw.editor ?? {},
    };

    if (hasTheme) {
        payload.site.theme = await readFile(themePath, "utf-8");
    }

    return {
        payload,
        hash:     canonicalSystemHash(payload),
        pageRefs: collectPageRefs(payload),
    };
}

export function canonicalSystemHash(payload: SystemPayload): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function readJson(path: string): Promise<Partial<SystemPayload>> {
    try {
        return JSON.parse(await readFile(path, "utf-8")) as Partial<SystemPayload>;
    } catch (e) {
        throw new Error(`Failed to parse ${path}: ${e instanceof Error ? e.message : e}`);
    }
}

function collectPageRefs(payload: SystemPayload): string[] {
    const refs: string[] = [];
    pushPath(refs, payload.site.notFound);
    pushPath(refs, payload.site.forbidden);
    pushPath(refs, payload.site.serverError);
    pushPath(refs, payload.site.login);
    return refs;
}

function pushPath(out: string[], ref: TPageRef | undefined): void {
    if (ref && typeof ref === "object" && "path" in ref && ref.path) out.push(ref.path);
}

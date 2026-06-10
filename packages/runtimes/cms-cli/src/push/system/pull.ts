import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchRemoteSystem } from "./apply";
import type { TPageRef } from "@bernouy/cms-content";

/**
 * Fetch the remote system snapshot and write `<siteDir>/system.json`
 * (without `theme`) plus `<siteDir>/theme.css` (the raw CSS). Mirror of
 * the scan pattern: file system stays the source of truth post-pull.
 */
export async function pullSystem(adminBase: URL, token: string, siteDir: string): Promise<void> {
    const remote = await fetchRemoteSystem(adminBase, token);
    await mkdir(siteDir, { recursive: true });

    const site = { ...(remote.site ?? {}) } as Record<string, unknown>;
    const theme = typeof site.theme === "string" ? site.theme : "";
    delete site.theme;

    const editor = remote.editor ?? {};

    site.notFound    = pageRefFromRemote(site.notFound);
    site.serverError = pageRefFromRemote(site.serverError);

    const json = JSON.stringify({ site, editor }, null, 4) + "\n";
    await writeFile(join(siteDir, "system.json"), json, "utf-8");
    if (theme) await writeFile(join(siteDir, "theme.css"), theme, "utf-8");
}

/**
 * The settings response sometimes ships `notFound` as a string (the raw
 * path stored in `<cms-form>` flat-dotted shape), sometimes as `TPageRef`.
 * Normalize to the canonical `{ path } | null` shape so the on-disk JSON
 * round-trips through `scan.ts` cleanly.
 */
function pageRefFromRemote(raw: unknown): TPageRef {
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw === "string") return { path: raw };
    if (typeof raw === "object" && raw !== null && "path" in raw) {
        const path = (raw as { path: unknown }).path;
        return typeof path === "string" && path !== "" ? { path } : null;
    }
    return null;
}

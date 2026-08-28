import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchRemoteSystem } from "./apply";
import { coercePageRef } from "@bernouy/cms-content";

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

    const themeSettings = remote.theme;

    site.notFound = coercePageRef(site.notFound);
    site.forbidden = coercePageRef(site.forbidden);
    site.serverError = coercePageRef(site.serverError);
    site.login = coercePageRef(site.login);

    const json =
        JSON.stringify(
            {
                site,
                ...(themeSettings ? { theme: themeSettings } : {}),
            },
            null,
            4,
        ) + "\n";
    await writeFile(join(siteDir, "system.json"), json, "utf-8");
    if (theme) {
        await writeFile(join(siteDir, "theme.css"), theme, "utf-8");
    }
}

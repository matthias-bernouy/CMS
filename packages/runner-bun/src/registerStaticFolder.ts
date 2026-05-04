import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { Runner } from "@bernouy/core";

/**
 * Recursively registers every file under `folderEntry` as a GET route on
 * `runner`, using the path relative to the folder as the URL. Runs
 * synchronously so callers (typically `register…Endpoints` helpers invoked
 * from a class constructor) don't have to race `runner.start()`.
 *
 * Example: `registerStaticFolder("./static", runner)` with
 *   static/admin/dashboard.html → GET /admin/dashboard.html
 *   static/forbidden.html       → GET /forbidden.html
 *
 * Files are read from disk lazily at each request via `Bun.file`, so memory
 * use stays flat even on large trees.
 */
export function registerStaticFolder(folderEntry: string, runner: Runner): void {
    const normalizedFolder = folderEntry.endsWith("/") ? folderEntry.slice(0, -1) : folderEntry;

    function walkDir(dir: string) {
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                walkDir(fullPath);
            } else if (entry.isFile()) {
                const relativePath = relative(normalizedFolder, fullPath);
                const routePath = "/" + relativePath.replace(/\\/g, "/");

                runner.get(routePath, async () => {
                    const file = Bun.file(fullPath);
                    return new Response(file);
                });
            }
        }
    }

    walkDir(normalizedFolder);
}

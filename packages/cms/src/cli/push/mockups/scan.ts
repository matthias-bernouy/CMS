import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TDataMockup } from "src/socle/interfaces/Data/data";
import { MOCKUP_FOLDER, walkProviderMockups } from "../shared/mockupsLayout";

export type LocalMockup = Omit<TDataMockup, "updatedAt">;

/**
 * Walk `<siteDir>/mockups/<providerId>/<path-segments>/<METHOD>/*.json`.
 * Filenames give the mockup name; the operation `(method, path)` is
 * derived from the folder hierarchy via `walkProviderMockups`.
 */
export async function scanMockups(siteDir: string): Promise<LocalMockup[]> {
    const root = join(siteDir, MOCKUP_FOLDER);
    if (!existsSync(root)) return [];

    const out: LocalMockup[] = [];
    const dirs = await readdir(root, { withFileTypes: true });
    for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const providerId  = dir.name;
        const descriptors = await walkProviderMockups(root, providerId);
        for (const d of descriptors) {
            const raw    = await readFile(d.file, "utf-8");
            const parsed = JSON.parse(raw) as Partial<TDataMockup>;
            out.push({
                providerId,
                method: d.method,
                path:   d.path,
                name:   d.name,
                status: Number(parsed.status ?? 200),
                body:   String(parsed.body   ?? "{}"),
                active: Boolean(parsed.active),
            });
        }
    }
    return out;
}

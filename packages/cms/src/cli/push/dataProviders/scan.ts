import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TDataAuth, TDataProvider, TDataProviderSource } from "src/socle/interfaces/Data/data";
import { isValidDataProviderId } from "src/socle/utils/validation";

const FOLDER = "data-providers";

export type LocalDataProvider = Omit<TDataProvider, "createdAt" | "lastSyncAt">;

/**
 * Walk `<siteDir>/data-providers/*.json`. Filename (without extension) is
 * the canonical id; an `id` field inside the file must agree if present.
 */
export async function scanDataProviders(siteDir: string): Promise<LocalDataProvider[]> {
    const root = join(siteDir, FOLDER);
    if (!existsSync(root)) return [];

    const files = (await readdir(root))
        .filter(f => f.endsWith(".json") && !f.startsWith("."));

    const out: LocalDataProvider[] = [];
    for (const file of files) {
        const id = file.slice(0, -".json".length);
        if (!isValidDataProviderId(id)) {
            throw new Error(`Invalid data provider filename "${file}" — use kebab-case (2-32 chars).`);
        }
        const raw = await readFile(join(root, file), "utf-8");
        const parsed = JSON.parse(raw) as Partial<LocalDataProvider>;
        if (parsed.id && parsed.id !== id) {
            throw new Error(`Data provider ${file} declares id="${parsed.id}" — rename to match.`);
        }
        const legacy = (parsed as { auth?: TDataAuth }).auth;
        out.push({
            id,
            source:      (parsed.source ?? "url") as TDataProviderSource,
            sourceUrl:   String(parsed.sourceUrl ?? ""),
            server:      String(parsed.server    ?? ""),
            spec:        String(parsed.spec      ?? ""),
            specAuth:    (parsed.specAuth    ?? legacy ?? { type: "none" }) as TDataAuth,
            runtimeAuth: (parsed.runtimeAuth ?? legacy ?? { type: "none" }) as TDataAuth,
        });
    }
    return out;
}

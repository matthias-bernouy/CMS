import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { sha256Hex } from "@bernouy/cms-shared";

const FILES_SUBDIR    = "files";
const REGISTRY_FILE   = ".cms-files-registry.json";

export type LocalFile = {
    /** POSIX path relative to `<siteDir>/files`, e.g. "images/hero.png". */
    path: string;
    /** Basename, e.g. "hero.png". */
    name: string;
    /** POSIX parent-dir path ("" at the root), e.g. "images". */
    dir:  string;
    /** Absolute filesystem path. */
    abs:  string;
    size: number;
    /** sha256 of the file bytes — drives change detection. */
    hash: string;
    /** The dev registry uuid for this path, sent as the upload `id` so the remote
     *  `_id` matches dev. Undefined only when the registry is missing the path
     *  (stale/uncommitted) — the remote then mints its own id (warned at scan). */
    id?:  string;
};

/**
 * Walk `<siteDir>/files/` recursively — the media tree, where folders are
 * directories and files are bytes (the same layout `p9r dev` serves locally).
 * Dotfiles (`.DS_Store`, …) and empty directories are skipped; an empty media
 * folder carries no content to push.
 */
export async function scanFiles(siteDir: string): Promise<LocalFile[]> {
    const root = join(siteDir, FILES_SUBDIR);
    if (!existsSync(root)) return [];

    const out: LocalFile[] = [];
    await walk(root, "", out);
    out.sort((a, b) => a.path.localeCompare(b.path));

    // Carry the dev registry uuid into each file so `apply` can send it as the
    // upload `id` (remote `_id` === dev id === id baked into by-id URLs). We TRUST
    // the committed registry — `p9r dev` / `p9r files reindex` guarantee every
    // on-disk file has a `byPath` entry. A miss means the registry is stale or
    // uncommitted: warn loudly and let the remote mint (no lazy-mint here — that
    // would bake a machine-specific uuid into the remote).
    const byPath = await loadRegistryByPath(siteDir);
    const missing: string[] = [];
    for (const f of out) {
        const id = byPath[f.path];
        if (id) f.id = id; else missing.push(f.path);
    }
    if (missing.length) {
        console.warn(`! ${missing.length} media file(s) have no id in ${REGISTRY_FILE}:`);
        for (const p of missing.slice(0, 10)) console.warn(`    ${p}`);
        if (missing.length > 10) console.warn(`    … and ${missing.length - 10} more`);
        console.warn(`  Run \`p9r files reindex\` and commit ${REGISTRY_FILE} before pushing —`);
        console.warn(`  otherwise the remote mints its own ids and their by-id URLs will not match.`);
    }
    return out;
}

/** Read the committed `path → uuid` map; tolerate absent/corrupt (→ all-missing
 *  warning above, and the reindex/gate steps are where that gets fixed). */
async function loadRegistryByPath(siteDir: string): Promise<Record<string, string>> {
    const p = join(siteDir, REGISTRY_FILE);
    if (!existsSync(p)) return {};
    try {
        const reg = JSON.parse(await readFile(p, "utf-8")) as { byPath?: Record<string, string> };
        return reg.byPath ?? {};
    } catch { return {}; }
}

async function walk(absDir: string, relDir: string, out: LocalFile[]): Promise<void> {
    const entries = await readdir(absDir, { withFileTypes: true });
    for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const abs = join(absDir, e.name);
        const rel = relDir ? posix.join(relDir, e.name) : e.name;
        if (e.isDirectory()) {
            await walk(abs, rel, out);
        } else if (e.isFile()) {
            const bytes = await readFile(abs);
            out.push({
                path: rel,
                name: e.name,
                dir:  relDir,
                abs,
                size: bytes.byteLength,
                hash: sha256Hex(bytes),
            });
        }
    }
}

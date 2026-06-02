import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";

const FILES_SUBDIR = "files";

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
    return out;
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
                hash: createHash("sha256").update(bytes).digest("hex"),
            });
        }
    }
}

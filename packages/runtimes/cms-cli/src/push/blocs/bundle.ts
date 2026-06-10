import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const EXCLUDED_DIRS = new Set(["node_modules", "dist", "tmp", ".cache", "build", ".git"]);

/**
 * Walk a bloc folder and return its files as `{ "<relative-path>": "<base64>" }`.
 * Path separators are normalized to `/` so the server-side blob travels
 * unchanged across OSes. Skips dotfiles, common build/dependency artefacts,
 * and anything bigger than ~2 MB to keep the upload payload sane.
 *
 * Pure read — no transformation. The CLI sends this whole map server-side
 * and `p9r pull` writes it back verbatim.
 */
export async function bundleBlocSource(folder: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    await walk(folder, folder, out);
    return out;
}

async function walk(dir: string, root: string, out: Record<string, string>): Promise<void> {
    const entries = await readdir(dir);
    for (const entry of entries) {
        if (entry.startsWith(".")) continue;
        if (EXCLUDED_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        const s = await stat(full);
        if (s.isDirectory()) {
            await walk(full, root, out);
        } else if (s.isFile()) {
            const buf = await readFile(full);
            const rel = relative(root, full).split(sep).join("/");
            out[rel] = buf.toString("base64");
        }
    }
}

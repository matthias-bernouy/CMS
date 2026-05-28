import { readdir, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { folderToCategory } from "cms-cli/push/shared/categoryFolder";

export type BlocManifest = {
    runtime?: string;
    editor?: string;
    bloc?: string;
    "default-tag"?: string;
    meta?: {
        author?: string;
        title?: string;
        description?: string;
        categories?: string[];
        images?: string[];
    };
};

export type DevBloc = {
    folder: string;
    manifest: BlocManifest;
    tag: string;
    label: string;
    group: string;
    description: string;
    entry: string;
    editorEntry?: string;
    /** Convention: `template.html` next to the bloc entry. Absent when the
     *  bloc renders without a shadow template. */
    templatePath?: string;
    /** Convention: `configuration.html` next to the editor entry. Absent
     *  for opaque blocs (no editor). */
    configurationPath?: string;
};

const EXCLUDED = new Set([
    "node_modules", "dist", ".git", "tmp", ".p9r-dev", ".cache", "build",
]);

export type ScanOptions = {
    /** Suppress warnings about skipped folders. Used by the polling loop which
     *  re-runs the scan every second and would otherwise spam identical logs. */
    quiet?: boolean;
};

export async function scanDevBlocs(root: string, options: ScanOptions = {}): Promise<DevBloc[]> {
    const results: DevBloc[] = [];
    await walk(root, results, options);
    return results;
}

async function walk(dir: string, results: DevBloc[], options: ScanOptions) {
    let entries: string[];
    try { entries = await readdir(dir); }
    catch { return; }

    if (entries.includes("manifest.json")) {
        const manifest = await parseManifest(join(dir, "manifest.json"), options);
        if (manifest) {
            const bloc = toDevBloc(dir, manifest, options);
            if (bloc) results.push(bloc);
        }
        return;
    }

    await Promise.all(entries.map(async (entry) => {
        if (EXCLUDED.has(entry) || entry.startsWith(".")) return;
        const full = join(dir, entry);
        let stats;
        try { stats = await stat(full); }
        catch { return; }
        if (stats.isDirectory()) await walk(full, results, options);
    }));
}

async function parseManifest(path: string, options: ScanOptions): Promise<BlocManifest | null> {
    try {
        const raw = await readFile(path, "utf-8");
        const parsed = JSON.parse(raw) as BlocManifest & { "default-group"?: string };
        if ("default-group" in parsed) {
            throw new Error(
                `manifest.json field "default-group" is no longer supported — ` +
                `the group is derived from the parent folder name. ` +
                `Drop the line and place the bloc under blocs/<group>/<tag>/ ` +
                `(re-running \`p9r pull\` does both automatically).`,
            );
        }
        return parsed;
    } catch (e) {
        if (!options.quiet) console.warn(`[scan] Failed to parse ${path}: ${e instanceof Error ? e.message : e}`);
        return null;
    }
}

function toDevBloc(folder: string, manifest: BlocManifest, options: ScanOptions): DevBloc | null {
    const tag = manifest["default-tag"];
    if (!tag) {
        if (!options.quiet) console.warn(`[scan] Skipping ${folder}: manifest has no "default-tag"`);
        return null;
    }
    if (tag === "tag-name") {
        if (!options.quiet) console.warn(`[scan] Skipping ${folder}: "default-tag" is still the placeholder "tag-name"`);
        return null;
    }

    const parentName = basename(dirname(folder));
    if (parentName === "blocs") {
        if (!options.quiet) {
            console.warn(
                `[scan] Skipping ${folder}: loose bloc at the root of blocs/ — ` +
                `move it under blocs/<group>/<tag>/ (or blocs/_uncategorized/<tag>/).`,
            );
        }
        return null;
    }

    const blocRel = manifest.bloc || "./Bloc.ts";
    const editorRel = manifest.editor;

    const entry = join(folder, blocRel);
    const editorEntry = editorRel ? join(folder, editorRel) : undefined;

    const templatePath      = join(dirname(entry), "template.html");
    const configurationPath = editorEntry ? join(dirname(editorEntry), "configuration.html") : undefined;

    return {
        folder,
        manifest,
        tag,
        label: manifest.meta?.title || basename(folder),
        group: folderToCategory(parentName),
        description: manifest.meta?.description || "",
        entry,
        ...(editorEntry                                ? { editorEntry }                              : {}),
        ...(existsSync(templatePath)                   ? { templatePath }                             : {}),
        ...(configurationPath && existsSync(configurationPath) ? { configurationPath }                : {}),
    };
}

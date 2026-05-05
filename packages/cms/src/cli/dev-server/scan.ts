import { readdir, stat, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

export type BlocManifest = {
    runtime?: string;
    editor?: string;
    bloc?: string;
    "default-tag"?: string;
    "default-group"?: string;
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
        return JSON.parse(raw) as BlocManifest;
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

    const blocRel = manifest.bloc || "./Bloc.ts";
    const editorRel = manifest.editor;

    return {
        folder,
        manifest,
        tag,
        label: manifest.meta?.title || basename(folder),
        group: manifest["default-group"] || "Uncategorized",
        description: manifest.meta?.description || "",
        entry: join(folder, blocRel),
        editorEntry: editorRel ? join(folder, editorRel) : undefined,
    };
}

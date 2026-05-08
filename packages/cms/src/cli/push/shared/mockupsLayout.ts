import { existsSync } from "node:fs";
import { readdir, rmdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;
const HTTP_METHODS_SET = new Set<string>(HTTP_METHODS);

/**
 * Filesystem layout for mockups, shared between the dev `MockupsStore`
 * and the push/pull CLI. The layout mirrors the OpenAPI mental model:
 *
 *   <root>/<providerId>/<path-segments>/<METHOD>/<name>.json
 *
 * `<path-segments>` is the OpenAPI path with the leading `/` stripped
 * and each `{name}` rewritten to `[name]` for filesystem safety
 * (`{}` are valid on most filesystems but trip shells / glob expansions
 * and a few CI tools). Paths equal to `/` collapse to no path segment
 * — the method folder lives directly under the provider folder.
 *
 * The encoding assumes OpenAPI paths don't carry literal `[` or `]`
 * characters. That holds in practice for the specs the CMS targets.
 */

export const MOCKUP_FOLDER = "mockups";

/** Convert an OpenAPI path to its on-disk segment form. `/` collapses to `[]`. */
export function pathToSegments(path: string): string[] {
    return path
        .split("/")
        .filter(s => s.length > 0)
        .map(encodeSegment);
}

/** Reverse of `pathToSegments` — joins segments back to a leading-slash path. */
export function segmentsToPath(segments: string[]): string {
    if (segments.length === 0) return "/";
    return "/" + segments.map(decodeSegment).join("/");
}

export function encodeSegment(seg: string): string {
    return seg.replace(/\{/g, "[").replace(/\}/g, "]");
}

export function decodeSegment(seg: string): string {
    return seg.replace(/\[/g, "{").replace(/\]/g, "}");
}

export function isHttpMethod(name: string): boolean {
    return HTTP_METHODS_SET.has(name);
}

/** Resolve the on-disk file for one mockup. */
export function mockupFile(root: string, providerId: string, method: string, path: string, name: string): string {
    const segments = pathToSegments(path);
    const parts    = [root, providerId, ...segments, method.toUpperCase(), `${name}.json`];
    return join(...parts);
}

/** Resolve the directory that holds every mockup file for one (provider, path, method). */
export function mockupMethodDir(root: string, providerId: string, method: string, path: string): string {
    const segments = pathToSegments(path);
    return join(root, providerId, ...segments, method.toUpperCase());
}

/**
 * Walk a provider folder and return one descriptor per mockup file
 * found. The walker recognizes a folder named after an HTTP verb as a
 * leaf; everything between the provider folder and the verb folder is
 * the OpenAPI path.
 */
export async function walkProviderMockups(root: string, providerId: string): Promise<MockupFileDescriptor[]> {
    const start = join(root, providerId);
    if (!existsSync(start)) return [];
    const out: MockupFileDescriptor[] = [];
    await walk(start, [], out);
    return out;
}

export type MockupFileDescriptor = {
    /** Absolute path to the .json file. */
    file:    string;
    method:  string;
    /** Decoded OpenAPI path with leading slash. */
    path:    string;
    /** Filename without `.json`. */
    name:    string;
};

async function walk(dir: string, segments: string[], out: MockupFileDescriptor[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const childDir = join(dir, entry.name);

        // A folder is treated as a method leaf only when its name matches
        // an HTTP verb AND it carries no subdirectories — that way an
        // OpenAPI path that legitimately contains a verb-named segment
        // (e.g. `/get/foo`) keeps recursing instead of being mistaken
        // for a method.
        const looksLikeVerb = isHttpMethod(entry.name.toUpperCase());
        const childEntries  = await readdir(childDir, { withFileTypes: true });
        const hasSubdirs    = childEntries.some(c => c.isDirectory());

        if (looksLikeVerb && !hasSubdirs) {
            for (const file of childEntries) {
                if (!file.isFile() || !file.name.endsWith(".json") || file.name.startsWith(".")) continue;
                out.push({
                    file:   join(childDir, file.name),
                    method: entry.name.toUpperCase(),
                    path:   segmentsToPath(segments),
                    name:   file.name.slice(0, -".json".length),
                });
            }
            continue;
        }

        await walk(childDir, [...segments, entry.name], out);
    }
}

/**
 * Remove `file` and any now-empty parent directory up to (but not
 * including) the provider folder. Keeps the tree free of orphan empty
 * dirs that git wouldn't track anyway.
 */
export async function deleteFileAndPrune(file: string, providerDir: string): Promise<void> {
    if (!existsSync(file)) return;
    await unlink(file);
    let dir = dirname(file);
    while (dir.length > providerDir.length && dir.startsWith(providerDir)) {
        const entries = await readdir(dir);
        if (entries.length > 0) break;
        await rmdir(dir);
        dir = dirname(dir);
    }
}

import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { discoverWorkspacePackages } from "../../architecture/core/files/workspaceDiscovery";
import type { UiSource } from "../contracts/types";
import { browserReachability } from "./graph";

const EXCLUDED_DIRECTORIES = new Set([
    "node_modules",
    "dist",
    ".registry",
    "coverage",
    "tests",
    "test",
    "__tests__",
    "fixtures",
    "__fixtures__",
]);
const SCRIPT = /\.[cm]?[jt]sx?$/;

export function isProductionSource(path: string): boolean {
    return (
        !path.split("/").some((part) => EXCLUDED_DIRECTORIES.has(part)) &&
        !/\.(?:d|test|spec|cases|fixture)\.[cm]?[jt]sx?$/.test(path) &&
        !path.endsWith("/src/browser/admin-runtime.js")
    );
}

export async function discoverUiSources(root: string): Promise<UiSource[]> {
    const packages = await discoverWorkspacePackages(root, []);
    const sourceRoots = [
        ...packages.map(({ root: packageRoot }) => packageRoot),
        join(root, "packages", "official-repository", "collections"),
    ];
    const paths: string[] = [];
    async function visit(directory: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return;
            }
            throw error;
        }
        for (const entry of entries) {
            const absolute = join(directory, entry.name);
            const path = relative(root, absolute).replaceAll("\\", "/");
            if (!isProductionSource(path)) {
                continue;
            }
            if (entry.isDirectory()) {
                await visit(absolute);
            } else if (entry.isFile() && (extname(path) === ".html" || SCRIPT.test(path))) {
                paths.push(path);
            }
        }
    }
    for (const sourceRoot of sourceRoots) {
        await visit(sourceRoot);
    }
    const sources: UiSource[] = await Promise.all(
        paths.sort().map(async (path) => ({
            path,
            content: await readFile(join(root, path), "utf8"),
            kind: path.endsWith(".html") ? "html" : "script",
            browser: false,
        })),
    );
    const browser = browserReachability(root, sources, packages);
    for (const source of sources) {
        source.browser = browser.has(source.path) || source.kind === "html";
    }
    return sources;
}

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
        !path.endsWith("/src/static/assets/control-components.js")
    );
}

export async function discoverUiSources(root: string): Promise<UiSource[]> {
    const packages = await discoverWorkspacePackages(root, []);
    const paths: string[] = [];
    async function visit(directory: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
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
    for (const pkg of packages) {
        await visit(pkg.root);
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

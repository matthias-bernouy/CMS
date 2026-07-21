import { relative, resolve, sep } from "node:path";

export const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");
export const BASELINE_PATH = resolve(import.meta.dir, "baseline.json");
export const REPORT_DIRECTORY = resolve(REPOSITORY_ROOT, "coverage");

const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const SKIPPED_DIRECTORIES = new Set(["coverage", "dist", "node_modules", "tests"]);

export function normalizePath(path: string): string {
    return path.split(sep).join("/").replace(/^\.\//, "");
}

function extensionOf(path: string): string {
    const match = /\.[^.\/]+$/.exec(path);
    return match?.[0] ?? "";
}

export function isPackageSourceFile(path: string, packagePath: string): boolean {
    const normalizedPath = normalizePath(path);
    const normalizedPackagePath = normalizePath(packagePath);
    if (!normalizedPath.startsWith(`${normalizedPackagePath}/`)) return false;
    if (normalizedPath.endsWith(".d.ts")) return false;
    if (!SOURCE_EXTENSIONS.has(extensionOf(normalizedPath))) return false;
    const relativePath = normalizedPath.slice(normalizedPackagePath.length + 1);
    return !relativePath.split("/").some((segment) => SKIPPED_DIRECTORIES.has(segment));
}

export function repositoryPath(absolutePath: string): string {
    return normalizePath(relative(REPOSITORY_ROOT, absolutePath));
}

export function shouldSkipDirectory(name: string): boolean {
    return SKIPPED_DIRECTORIES.has(name);
}

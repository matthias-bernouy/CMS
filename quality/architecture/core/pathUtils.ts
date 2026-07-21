import { isAbsolute, relative, sep } from "node:path";

export function normalizeRelativePath(path: string): string {
    return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

export function toRelativePath(rootDir: string, path: string): string {
    return normalizeRelativePath(relative(rootDir, path));
}

export function isIgnored(path: string, ignoredPaths: readonly string[]): boolean {
    const normalized = normalizeRelativePath(path);
    return ignoredPaths.some((ignored) => normalized === ignored || normalized.startsWith(`${ignored}/`));
}

export function isPathInside(path: string, parent: string): boolean {
    const relation = relative(parent, path);
    return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

export function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

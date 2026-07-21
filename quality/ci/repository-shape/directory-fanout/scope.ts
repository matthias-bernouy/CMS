import type { DirectoryEntries } from "./policy";

export const QUALITY_SCOPE_ROOT = "quality";

export function findDirectoryFanoutScopeRoots(paths: Iterable<string>): string[] {
    const roots = new Set<string>([QUALITY_SCOPE_ROOT]);

    for (const path of paths) {
        const segments = path.split("/").filter(Boolean);

        if (segments.length === 4 && segments[0] === "packages" && segments[3] === "package.json") {
            roots.add(segments.slice(0, 3).join("/"));
        }
    }

    return [...roots].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export function collectScopedDirectoryEntries(paths: Iterable<string>): DirectoryEntries {
    const currentPaths = [...paths];
    const scopeRoots = new Set(findDirectoryFanoutScopeRoots(currentPaths));
    const directories: DirectoryEntries = new Map();

    for (const path of currentPaths) {
        const segments = path.split("/").filter(Boolean);
        const scopeDepth = getScopeDepth(segments, scopeRoots);

        if (scopeDepth === undefined) {
            continue;
        }

        for (let index = scopeDepth; index < segments.length; index += 1) {
            const entry = segments[index];
            if (entry === undefined) {
                continue;
            }

            const directory = segments.slice(0, index).join("/");
            const entries = directories.get(directory) ?? new Set<string>();

            entries.add(entry);
            directories.set(directory, entries);
        }
    }

    return directories;
}

function getScopeDepth(segments: string[], scopeRoots: Set<string>): number | undefined {
    if (segments[0] === QUALITY_SCOPE_ROOT) {
        return 1;
    }

    if (segments[0] !== "packages" || segments.length < 4) {
        return undefined;
    }

    return scopeRoots.has(segments.slice(0, 3).join("/")) ? 3 : undefined;
}

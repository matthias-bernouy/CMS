export const TARGET_DIRECTORY_ENTRIES = 7;
export const MAX_DIRECTORY_ENTRIES = 8;

export type DirectoryEntries = Map<string, Set<string>>;

export type DirectoryFanoutViolation = {
    path: string;
    currentEntries: number;
    allowedEntries: number;
    reason: "legacy_growth" | "new_over_limit";
};

export function collectDirectoryEntries(paths: Iterable<string>): DirectoryEntries {
    const directories: DirectoryEntries = new Map();
    for (const path of paths) {
        const segments = path.split("/").filter(Boolean);
        for (let index = 0; index < segments.length; index += 1) {
            const directory = index === 0 ? "." : segments.slice(0, index).join("/");
            const entries = directories.get(directory) ?? new Set<string>();
            entries.add(segments[index]!);
            directories.set(directory, entries);
        }
    }
    return directories;
}

export function findDirectoryFanoutViolations(
    current: ReadonlyMap<string, ReadonlySet<string>>,
    baseline: ReadonlyMap<string, ReadonlySet<string>>,
    renamedDirectories: ReadonlyMap<string, string> = new Map(),
): DirectoryFanoutViolation[] {
    const violations: DirectoryFanoutViolation[] = [];
    for (const [path, entries] of current) {
        const currentEntries = entries.size;
        if (currentEntries <= MAX_DIRECTORY_ENTRIES) continue;
        const sourcePath = renamedDirectories.get(path) ?? path;
        const previousEntries = baseline.get(sourcePath)?.size;
        const allowedEntries = Math.max(MAX_DIRECTORY_ENTRIES, previousEntries ?? 0);
        if (currentEntries <= allowedEntries) continue;
        violations.push({
            path,
            currentEntries,
            allowedEntries,
            reason: previousEntries === undefined ? "new_over_limit" : "legacy_growth",
        });
    }
    return violations.sort((left, right) => left.path.localeCompare(right.path));
}

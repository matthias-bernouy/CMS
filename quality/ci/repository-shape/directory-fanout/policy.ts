export const TARGET_DIRECTORY_ENTRIES = 7;
export const MAX_DIRECTORY_ENTRIES = 8;

export type DirectoryEntries = Map<string, Set<string>>;

export type DirectoryFanoutFinding = {
    path: string;
    currentEntries: number;
    severity: "info" | "error";
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

export function findDirectoryFanoutFindings(
    current: ReadonlyMap<string, ReadonlySet<string>>,
): DirectoryFanoutFinding[] {
    const findings: DirectoryFanoutFinding[] = [];
    for (const [path, entries] of current) {
        const currentEntries = entries.size;
        if (currentEntries <= TARGET_DIRECTORY_ENTRIES) {
            continue;
        }
        findings.push({
            path,
            currentEntries,
            severity: currentEntries > MAX_DIRECTORY_ENTRIES ? "error" : "info",
        });
    }
    return findings.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export function hasBlockingDirectoryFanoutFindings(findings: readonly DirectoryFanoutFinding[]): boolean {
    return findings.some(({ severity }) => severity === "error");
}

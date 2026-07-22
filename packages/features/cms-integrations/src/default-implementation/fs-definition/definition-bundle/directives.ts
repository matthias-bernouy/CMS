export type DefinitionDirective = { kind: "include"; path: string } | { kind: "files"; paths: string[] };

export function parseDefinitionDirective(value: Record<string, unknown>, source: string): DefinitionDirective | null {
    const hasInclude = Object.hasOwn(value, "$include");
    const hasFiles = Object.hasOwn(value, "$files");
    if (!hasInclude && !hasFiles) {
        return null;
    }
    if (Object.keys(value).length !== 1 || hasInclude === hasFiles) {
        throw new Error(`${source}: a definition directive must contain exactly one of $include or $files`);
    }
    if (hasInclude) {
        if (typeof value.$include !== "string" || !value.$include.trim()) {
            throw new Error(`${source}: $include must be a non-empty JSON path`);
        }
        return { kind: "include", path: value.$include };
    }
    if (!Array.isArray(value.$files) || value.$files.some((path) => typeof path !== "string" || !path.trim())) {
        throw new Error(`${source}: $files must be an array of non-empty JSON paths`);
    }
    return { kind: "files", paths: value.$files as string[] };
}

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
type JsonObject = Record<string, unknown>;

export type ResourceTree = {
    directories: string[];
    files: string[];
    wideDirectories: string[];
};

export type SqlManifestGraph = {
    manifests: string[];
    reachedManifests: string[];
    roots: string[];
};

export async function walkResourceTree(root: string): Promise<ResourceTree> {
    const directories: string[] = [];
    const files: string[] = [];
    const wideDirectories: string[] = [];

    async function walk(directory: string): Promise<void> {
        const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
            left.name.localeCompare(right.name),
        );
        if (entries.length > 8) {
            wideDirectories.push(`${portableRelative(root, directory)} (${entries.length})`);
        }
        for (const entry of entries) {
            const path = resolve(directory, entry.name);
            if (entry.isDirectory()) {
                directories.push(path);
                await walk(path);
            } else {
                files.push(path);
            }
        }
    }

    await walk(root);
    return { directories, files, wideDirectories };
}

export async function readJsonObject(file: string): Promise<JsonObject> {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isObject(value)) {
        throw new Error(`${file}: expected a JSON object`);
    }
    return value;
}

export async function collectDefinitionFiles(entryFile: string): Promise<Set<string>> {
    const reached = new Set<string>([entryFile]);
    const entry = await readJsonObject(entryFile);

    async function visitFile(file: string): Promise<void> {
        if (reached.has(file)) {
            return;
        }
        reached.add(file);
        await visitValue(JSON.parse(await readFile(file, "utf8")), file);
    }

    async function visitValue(value: unknown, source: string): Promise<void> {
        if (Array.isArray(value)) {
            for (const item of value) {
                await visitValue(item, source);
            }
            return;
        }
        if (!isObject(value)) {
            return;
        }
        if (typeof value.$include === "string") {
            await visitFile(resolve(dirname(source), value.$include));
            return;
        }
        if (Array.isArray(value.$files)) {
            for (const reference of value.$files) {
                if (typeof reference === "string") {
                    await visitFile(resolve(dirname(source), reference));
                }
            }
            return;
        }
        for (const child of Object.values(value)) {
            await visitValue(child, source);
        }
    }

    if (typeof entry.root === "string") {
        await visitFile(resolve(dirname(entryFile), entry.root));
    }
    return reached;
}

export async function inspectSqlManifestGraph(sqlRoot: string): Promise<SqlManifestGraph> {
    const manifests = (await walkResourceTree(sqlRoot)).files.filter((file) => extname(file) === ".json");
    const edges = new Map<string, string[]>();
    const nested = new Set<string>();
    for (const manifest of manifests) {
        const value = await readJsonObject(manifest);
        const children = (Array.isArray(value.entries) ? value.entries : [])
            .filter(isObject)
            .flatMap((entry) =>
                typeof entry.manifest === "string" ? [resolve(dirname(manifest), entry.manifest)] : [],
            );
        edges.set(manifest, children);
        children.forEach((child) => nested.add(child));
    }
    const roots = manifests.filter((manifest) => !nested.has(manifest));
    const reached = new Set<string>();
    function visit(manifest: string): void {
        if (reached.has(manifest)) {
            return;
        }
        reached.add(manifest);
        edges.get(manifest)?.forEach(visit);
    }
    roots.forEach(visit);
    return { manifests, reachedManifests: [...reached], roots };
}

export function physicalLineCount(source: string): number {
    if (!source) {
        return 0;
    }
    const trailingBreak = /(?:\r\n|\r|\n)$/u.test(source) ? 1 : 0;
    return source.split(/\r\n|\r|\n/u).length - trailingBreak;
}

export function isCohesiveSqlException(source: string): boolean {
    const declarations = source.match(/^\s*create\s+or\s+replace\s+function\b/gimu) ?? [];
    return declarations.length === 1 && source.trimEnd().endsWith("$$;");
}

export function nonThematicResourcePaths(root: string, tree: ResourceTree): string[] {
    return [...tree.directories, ...tree.files]
        .map((path) => portableRelative(root, path))
        .filter((path) => /(?:^|\/)\d+(?:[-_./]|$)|(?:--|-through-|-[0-9a-f]{8,}\.(?:json|sql)$)/u.test(path));
}

export function portableRelative(root: string, path: string): string {
    return relative(root, path).split(sep).join("/") || ".";
}

function isObject(value: unknown): value is JsonObject {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export type BuildManifestEntry = {
    path: string;
    kind: "file" | "symlink";
    mode: number;
    size: number;
    sha256: string;
};

export type BuildManifest = {
    schemaVersion: 1;
    files: BuildManifestEntry[];
};

const CONTROL_ASSET = "packages/surfaces/cms-control/src/static/assets/control-components.js";
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

function normalizePath(path: string): string {
    return path.split(sep).join("/");
}

async function hashFile(path: string): Promise<string> {
    return createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
}

async function manifestEntry(rootDir: string, path: string): Promise<BuildManifestEntry> {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
        const target = await readlink(path);
        return {
            path: normalizePath(relative(rootDir, path)),
            kind: "symlink",
            mode: stats.mode & 0o777,
            size: Buffer.byteLength(target),
            sha256: createHash("sha256").update(target).digest("hex"),
        };
    }
    if (!stats.isFile()) {
        throw new Error(`Unsupported build output at ${relative(rootDir, path)}`);
    }
    return {
        path: normalizePath(relative(rootDir, path)),
        kind: "file",
        mode: stats.mode & 0o777,
        size: stats.size,
        sha256: await hashFile(path),
    };
}

async function collectTreeFiles(root: string): Promise<string[]> {
    const files: string[] = [];
    async function visit(directory: string): Promise<void> {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(path);
            } else {
                files.push(path);
            }
        }
    }
    await visit(root);
    return files;
}

async function discoverBuildOutputs(rootDir: string): Promise<string[]> {
    const outputs = new Set<string>();
    const packagesRoot = join(rootDir, "packages");

    async function visit(directory: string): Promise<void> {
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
            if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) {
                continue;
            }
            const path = join(directory, entry.name);
            if (entry.isDirectory() && entry.name === "dist") {
                for (const output of await collectTreeFiles(path)) {
                    outputs.add(output);
                }
            } else if (entry.isDirectory()) {
                await visit(path);
            } else if (entry.name.endsWith(".tsbuildinfo")) {
                outputs.add(path);
            }
        }
    }

    await visit(packagesRoot);
    outputs.add(join(rootDir, CONTROL_ASSET));
    return [...outputs].sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
}

export async function createBuildManifest(rootDir: string): Promise<BuildManifest> {
    const root = resolve(rootDir);
    const files: BuildManifestEntry[] = [];
    for (const path of await discoverBuildOutputs(root)) {
        files.push(await manifestEntry(root, path));
    }
    if (files.length === 0) {
        throw new Error("No build outputs were found");
    }
    return { schemaVersion: 1, files };
}

async function main(): Promise<void> {
    const outputPath = process.argv[2];
    if (!outputPath || process.argv.length !== 3) {
        throw new Error("Usage: bun run quality/ci/determinism/build-manifest.ts <output-path>");
    }
    const manifest = await createBuildManifest(resolve(import.meta.dir, "../../.."));
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(resolve(outputPath), `${JSON.stringify(manifest, null, 4)}\n`);
}

if (import.meta.main) {
    await main();
}

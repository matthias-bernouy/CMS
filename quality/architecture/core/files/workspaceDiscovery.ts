import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as ts from "@typescript/typescript6";
import {
    type PackageManifest,
    type PackagePathAlias,
    WORKSPACE_LAYERS,
    type WorkspacePackage,
} from "../architectureTypes";
import { collectCodeFiles } from "./codeFiles";
import { isIgnored, isMissingPathError, toRelativePath } from "../pathUtils";

export async function discoverWorkspacePackages(
    rootDir: string,
    ignoredPaths: readonly string[],
): Promise<WorkspacePackage[]> {
    const packages: WorkspacePackage[] = [];
    for (const layer of WORKSPACE_LAYERS) {
        const layerRoot = join(rootDir, "packages", layer);
        let entries;
        try {
            entries = await readdir(layerRoot, { withFileTypes: true });
        } catch (error) {
            if (isMissingPathError(error)) {
                continue;
            }
            throw error;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const packageRoot = join(layerRoot, entry.name);
            const relativeRoot = toRelativePath(rootDir, packageRoot);
            if (isIgnored(relativeRoot, ignoredPaths)) {
                continue;
            }
            const manifest = await readManifest(join(packageRoot, "package.json"));
            if (!manifest?.name) {
                continue;
            }
            packages.push(await workspacePackage(packageRoot, relativeRoot, manifest, layer, rootDir, ignoredPaths));
        }
    }
    const packagesRoot = join(rootDir, "packages");
    for (const entry of await readDirectories(packagesRoot)) {
        const packageRoot = join(packagesRoot, entry);
        const relativeRoot = toRelativePath(rootDir, packageRoot);
        if (isIgnored(relativeRoot, ignoredPaths)) {
            continue;
        }
        const manifest = await readManifest(join(packageRoot, "package.json"));
        const layer = manifest ? declaredLayer(manifest) : undefined;
        if (!manifest?.name || !layer) {
            continue;
        }
        packages.push(await workspacePackage(packageRoot, relativeRoot, manifest, layer, rootDir, ignoredPaths));
    }
    return packages.sort((a, b) => a.name.localeCompare(b.name));
}

async function readDirectories(root: string): Promise<string[]> {
    try {
        return (await readdir(root, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
    } catch (error) {
        if (isMissingPathError(error)) {
            return [];
        }
        throw error;
    }
}

function declaredLayer(manifest: PackageManifest): (typeof WORKSPACE_LAYERS)[number] | undefined {
    const layer = manifest.architecture?.layer;
    return WORKSPACE_LAYERS.find((candidate) => candidate === layer);
}

async function workspacePackage(
    packageRoot: string,
    relativeRoot: string,
    manifest: PackageManifest,
    layer: (typeof WORKSPACE_LAYERS)[number],
    rootDir: string,
    ignoredPaths: readonly string[],
): Promise<WorkspacePackage> {
    const name = manifest.name;
    if (!name) {
        throw new Error(`Workspace package at ${relativeRoot} has no name`);
    }
    return {
        name,
        layer,
        root: packageRoot,
        relativeRoot,
        manifest,
        sourceFiles: await collectCodeFiles(packageRoot, rootDir, ignoredPaths),
        pathAliases: await readPackagePathAliases(packageRoot, name),
    };
}

async function readManifest(path: string): Promise<PackageManifest | undefined> {
    try {
        return JSON.parse(await readFile(path, "utf8")) as PackageManifest;
    } catch (error) {
        if (isMissingPathError(error)) {
            return undefined;
        }
        throw error;
    }
}

async function readPackagePathAliases(packageRoot: string, packageName: string): Promise<PackagePathAlias[]> {
    const aliases: PackagePathAlias[] = [];
    const tsconfigPath = join(packageRoot, "tsconfig.json");
    try {
        const parsed = ts.parseConfigFileTextToJson(tsconfigPath, await readFile(tsconfigPath, "utf8"));
        if (parsed.error) {
            throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
        }
        const options = parsed.config?.compilerOptions as { baseUrl?: unknown; paths?: unknown } | undefined;
        const baseDir = typeof options?.baseUrl === "string" ? resolve(packageRoot, options.baseUrl) : packageRoot;
        if (options?.paths && typeof options.paths === "object") {
            for (const [pattern, rawTargets] of Object.entries(options.paths as Record<string, unknown>)) {
                if (!Array.isArray(rawTargets)) {
                    continue;
                }
                const targets = rawTargets.filter((target): target is string => typeof target === "string");
                if (targets.length > 0) {
                    aliases.push({ pattern, targets, baseDir });
                }
            }
        }
    } catch (error) {
        if (!isMissingPathError(error)) {
            throw error;
        }
    }

    const conventionalName = packageName.split("/").at(-1)!;
    if (!aliases.some(({ pattern }) => pattern === conventionalName || pattern.startsWith(`${conventionalName}/`))) {
        aliases.push({ pattern: `${conventionalName}/*`, targets: ["src/*", "*"], baseDir: packageRoot });
    }
    return aliases;
}

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as ts from "typescript";
import {
    type PackageManifest,
    type PackagePathAlias,
    WORKSPACE_LAYERS,
    type WorkspacePackage,
} from "./architectureTypes";
import { collectCodeFiles } from "./codeFiles";
import { isIgnored, isMissingPathError, toRelativePath } from "./pathUtils";

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
            if (isMissingPathError(error)) continue;
            throw error;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const packageRoot = join(layerRoot, entry.name);
            const relativeRoot = toRelativePath(rootDir, packageRoot);
            if (isIgnored(relativeRoot, ignoredPaths)) continue;
            const manifest = await readManifest(join(packageRoot, "package.json"));
            if (!manifest?.name) continue;
            packages.push({
                name: manifest.name,
                layer,
                root: packageRoot,
                relativeRoot,
                manifest,
                sourceFiles: await collectCodeFiles(packageRoot, rootDir, ignoredPaths),
                pathAliases: await readPackagePathAliases(packageRoot, manifest.name),
            });
        }
    }
    return packages.sort((a, b) => a.name.localeCompare(b.name));
}

async function readManifest(path: string): Promise<PackageManifest | undefined> {
    try {
        return JSON.parse(await readFile(path, "utf8")) as PackageManifest;
    } catch (error) {
        if (isMissingPathError(error)) return undefined;
        throw error;
    }
}

async function readPackagePathAliases(
    packageRoot: string,
    packageName: string,
): Promise<PackagePathAlias[]> {
    const aliases: PackagePathAlias[] = [];
    const tsconfigPath = join(packageRoot, "tsconfig.json");
    try {
        const parsed = ts.parseConfigFileTextToJson(tsconfigPath, await readFile(tsconfigPath, "utf8"));
        if (parsed.error) throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
        const options = parsed.config?.compilerOptions as { baseUrl?: unknown; paths?: unknown } | undefined;
        const baseDir = typeof options?.baseUrl === "string"
            ? resolve(packageRoot, options.baseUrl)
            : packageRoot;
        if (options?.paths && typeof options.paths === "object") {
            for (const [pattern, rawTargets] of Object.entries(options.paths as Record<string, unknown>)) {
                if (!Array.isArray(rawTargets)) continue;
                const targets = rawTargets.filter((target): target is string => typeof target === "string");
                if (targets.length > 0) aliases.push({ pattern, targets, baseDir });
            }
        }
    } catch (error) {
        if (!isMissingPathError(error)) throw error;
    }

    const conventionalName = packageName.split("/").at(-1)!;
    if (!aliases.some(({ pattern }) => pattern === conventionalName || pattern.startsWith(`${conventionalName}/`))) {
        aliases.push({ pattern: `${conventionalName}/*`, targets: ["src/*", "*"], baseDir: packageRoot });
    }
    return aliases;
}

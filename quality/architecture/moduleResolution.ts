import { dirname, extname, join, resolve } from "node:path";
import type { WorkspacePackage } from "./architectureTypes";
import { declaredExportTargets, parseWorkspaceSpecifier } from "./packageExports";
import { matchPattern } from "./pattern";
import { isPathInside, normalizeRelativePath } from "./pathUtils";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

export function resolveBrowserImport(
    file: string,
    specifier: string,
    sourceFiles: ReadonlySet<string>,
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    packageByRoot: readonly WorkspacePackage[],
): string[] {
    if (specifier.startsWith(".")) {
        const resolved = resolveSourcePath(resolve(dirname(file), specifier), sourceFiles);
        return resolved ? [resolved] : [];
    }

    const owner = packageByRoot.find((pkg) => isPathInside(file, pkg.root));
    if (owner) {
        const aliases = resolvePackageAliasImports(owner, specifier, sourceFiles);
        if (aliases.length > 0) return aliases;
    }

    const workspaceImport = parseWorkspaceSpecifier(specifier, packageByName);
    if (!workspaceImport) return [];
    const subpath = workspaceImport.subpath ? `./${workspaceImport.subpath}` : ".";
    return declaredExportTargets(workspaceImport.pkg.manifest.exports, subpath)
        .map((target) => resolveExportSourceTarget(workspaceImport.pkg, target, sourceFiles))
        .filter((target): target is string => target !== undefined);
}

export function resolvePackageAliasImports(
    owner: WorkspacePackage,
    specifier: string,
    sourceFiles: ReadonlySet<string>,
): string[] {
    const resolvedAliases: string[] = [];
    for (const alias of owner.pathAliases) {
        const wildcard = matchPattern(alias.pattern, specifier);
        if (wildcard === undefined) continue;
        for (const target of alias.targets) {
            const aliasedTarget = target.includes("*") ? target.replaceAll("*", wildcard) : target;
            const resolved = resolveSourcePath(resolve(alias.baseDir, aliasedTarget), sourceFiles);
            if (resolved) resolvedAliases.push(resolved);
        }
    }
    return [...new Set(resolvedAliases)];
}

export function resolveSourcePath(
    base: string,
    sourceFiles: ReadonlySet<string>,
): string | undefined {
    const emittedExtension = extname(base);
    const sourceStem = new Set([".js", ".jsx", ".mjs", ".cjs"]).has(emittedExtension)
        ? base.slice(0, -emittedExtension.length)
        : undefined;
    const candidates = [
        base,
        ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
        ...(sourceStem ? [".ts", ".tsx", ".mts", ".cts"].map((extension) => `${sourceStem}${extension}`) : []),
    ];
    return candidates.find((candidate) => sourceFiles.has(candidate));
}

export function resolveExportSourceTarget(
    pkg: WorkspacePackage,
    target: string,
    sourceFiles: ReadonlySet<string>,
): string | undefined {
    const direct = resolveSourcePath(resolve(pkg.root, target), sourceFiles);
    if (direct) return direct;

    const normalizedTarget = normalizeRelativePath(target);
    if (!normalizedTarget.startsWith("dist/")) return undefined;
    const generatedRelative = normalizedTarget.slice("dist/".length);
    const extension = extname(generatedRelative);
    const sourceRelative = extension ? generatedRelative.slice(0, -extension.length) : generatedRelative;
    return resolveSourcePath(resolve(pkg.root, "src", sourceRelative), sourceFiles);
}

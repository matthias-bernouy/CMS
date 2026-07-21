import { resolve } from "node:path";
import {
    type ArchitectureViolation,
    type SourceImport,
    type WorkspacePackage,
} from "./architectureTypes";
import { resolveBrowserImport, resolveExportSourceTarget } from "./moduleResolution";
import { declaredExportTargets, exportTargets } from "./packageExports";
import { toRelativePath } from "./pathUtils";
import { isRuntimeAdapter } from "./runtimeAdapterRules";

export async function checkBrowserEntrypoints(
    packages: readonly WorkspacePackage[],
    importsByFile: ReadonlyMap<string, SourceImport[]>,
    configuredEntries: readonly string[],
    adapterSubpaths: readonly string[],
    infrastructureModules: readonly string[],
    violations: ArchitectureViolation[],
    rootDir: string,
): Promise<void> {
    const packageByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
    const packageByRoot = [...packages].sort((a, b) => b.root.length - a.root.length);
    const entries = browserEntries(packages, configuredEntries, rootDir);
    const sourceFiles = new Set(importsByFile.keys());
    const visited = new Set<string>();
    const pending = [...entries].filter((entry) => sourceFiles.has(entry));

    while (pending.length > 0) {
        const file = pending.pop()!;
        if (visited.has(file)) continue;
        visited.add(file);
        for (const imported of importsByFile.get(file) ?? []) {
            if (imported.typeOnly) continue;
            if (isRuntimeAdapter(
                imported.specifier,
                adapterSubpaths,
                infrastructureModules,
                true,
                packageByName,
            )) {
                violations.push({
                    kind: "browser-runtime-adapter",
                    file: toRelativePath(rootDir, file),
                    line: imported.line,
                    message: `browser entry imports server/runtime module ${imported.specifier}`,
                });
            }
            pending.push(...resolveBrowserImport(
                file,
                imported.specifier,
                sourceFiles,
                packageByName,
                packageByRoot,
            ));
        }
    }
}

function browserEntries(
    packages: readonly WorkspacePackage[],
    configuredEntries: readonly string[],
    rootDir: string,
): Set<string> {
    const entries = new Set<string>();
    for (const pkg of packages) {
        for (const entry of inferredBrowserEntries(pkg)) entries.add(entry);
        for (const file of pkg.sourceFiles) if (/\.client\.[cm]?[jt]sx?$/.test(file)) entries.add(file);
    }
    for (const entry of configuredEntries) entries.add(resolve(rootDir, entry));
    return entries;
}

function inferredBrowserEntries(pkg: WorkspacePackage): string[] {
    const entries: string[] = [];
    if (pkg.name.split("/").at(-1) === "components") {
        for (const target of declaredExportTargets(pkg.manifest.exports, ".")) {
            if (!target.endsWith(".d.ts")) entries.push(resolveExportEntry(pkg, target));
        }
        entries.push(resolve(pkg.root, "src/index.ts"));
    }
    if (!pkg.manifest.exports || typeof pkg.manifest.exports !== "object") return entries;
    for (const [subpath, value] of Object.entries(pkg.manifest.exports as Record<string, unknown>)) {
        if (!/(?:browser|client|component|editor)/i.test(subpath) && !hasObjectKey(value, "browser")) continue;
        for (const target of exportTargets(value)) {
            if (!target.endsWith(".d.ts")) entries.push(resolveExportEntry(pkg, target));
        }
    }
    return entries;
}

function resolveExportEntry(pkg: WorkspacePackage, target: string): string {
    return resolveExportSourceTarget(pkg, target, new Set(pkg.sourceFiles)) ?? resolve(pkg.root, target);
}

function hasObjectKey(value: unknown, key: string): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    return key in object || Object.values(object).some((nested) => hasObjectKey(nested, key));
}

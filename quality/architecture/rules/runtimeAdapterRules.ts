import { builtinModules } from "node:module";
import { type ArchitectureViolation, type SourceImport, type WorkspacePackage } from "../core/architectureTypes";
import { parseWorkspaceSpecifier } from "../core/resolution/packageExports";
import { toRelativePath } from "../core/pathUtils";

const NODE_BUILTINS = new Set(builtinModules.map((module) => module.replace(/^node:/, "")));

export function checkSurfaceAdapters(
    file: string,
    imports: readonly SourceImport[],
    adapterSubpaths: readonly string[],
    infrastructureModules: readonly string[],
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    for (const imported of imports) {
        if (!isRuntimeAdapter(imported.specifier, adapterSubpaths, infrastructureModules, false, packageByName)) {
            continue;
        }
        violations.push({
            kind: "surface-runtime-adapter",
            file: toRelativePath(rootDir, file),
            line: imported.line,
            message: `surface code imports runtime adapter ${imported.specifier}`,
        });
    }
}

export function isRuntimeAdapter(
    specifier: string,
    adapterSubpaths: readonly string[],
    infrastructureModules: readonly string[],
    browser: boolean,
    packageByName: ReadonlyMap<string, WorkspacePackage>,
): boolean {
    const normalizedBuiltin = specifier.replace(/^node:/, "");
    if (browser && (specifier === "bun" || specifier.startsWith("bun:") || NODE_BUILTINS.has(normalizedBuiltin))) {
        return true;
    }
    if (infrastructureModules.some((module) => specifier === module || specifier.startsWith(`${module}/`))) {
        return true;
    }
    if (specifier.startsWith("@aws-sdk/")) {
        return true;
    }

    const workspaceImport = parseWorkspaceSpecifier(specifier, packageByName);
    if (!workspaceImport) {
        return false;
    }
    const subpathSegments = workspaceImport.subpath.replaceAll("\\", "/").split("/");
    return subpathSegments.some((segment) => adapterSubpaths.includes(segment.toLowerCase()));
}

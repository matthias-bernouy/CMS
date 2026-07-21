import { dirname, extname, isAbsolute, join, normalize, resolve } from "node:path";
import {
    type ArchitectureViolation,
    CODE_EXTENSIONS,
    type SourceImport,
    type WorkspacePackage,
} from "../core/architectureTypes";
import { layerRank } from "./dependencyRules";
import { resolvePackageAliasImports } from "../core/resolution/moduleResolution";
import { isDeclaredExport, parseWorkspaceSpecifier } from "../core/resolution/packageExports";
import { isPathInside, toRelativePath } from "../core/pathUtils";

export function checkExportFilesDeclared(
    packages: readonly WorkspacePackage[],
    violations: ArchitectureViolation[],
): void {
    for (const pkg of packages) {
        for (const file of pkg.sourceFiles) {
            const exportFile = toRelativePath(join(pkg.root, "src", "exports"), file);
            const extension = extname(exportFile);
            if (exportFile.startsWith("../") || !CODE_EXTENSIONS.has(extension)) {
                continue;
            }
            const name = exportFile.slice(0, -extension.length);
            const subpath =
                name === "index" ? "." : name.endsWith("/index") ? `./${name.slice(0, -"/index".length)}` : `./${name}`;
            if (isDeclaredExport(pkg.manifest.exports, subpath)) {
                continue;
            }
            violations.push({
                kind: "undeclared-subpath",
                file: `${pkg.relativeRoot}/src/exports/${exportFile}`,
                message: `${pkg.name} export file is not declared as ${subpath} in package.json`,
            });
        }
    }
}

export function checkImportedWorkspaceSubpath(
    owner: WorkspacePackage,
    file: string,
    imported: SourceImport,
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    const parsed = parseWorkspaceSpecifier(imported.specifier, packageByName);
    if (!parsed) {
        return;
    }
    const exportedSubpath = parsed.subpath ? `./${parsed.subpath}` : ".";
    if (isDeclaredExport(parsed.pkg.manifest.exports, exportedSubpath)) {
        return;
    }
    violations.push({
        kind: "undeclared-subpath",
        file: toRelativePath(rootDir, file),
        line: imported.line,
        message: `${owner.name} imports ${imported.specifier}, but ${exportedSubpath} is not declared by ${parsed.pkg.name}`,
    });
}

export function checkImportedLayer(
    owner: WorkspacePackage,
    file: string,
    imported: SourceImport,
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    packageByRoot: readonly WorkspacePackage[],
    sourceFiles: ReadonlySet<string>,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    const aliases = resolvePackageAliasImports(owner, imported.specifier, sourceFiles);
    if (aliases.length > 0) {
        for (const targetPath of aliases) {
            const target = packageByRoot.find((pkg) => isPathInside(targetPath, pkg.root));
            if (!target || layerRank(owner.layer) >= layerRank(target.layer)) {
                continue;
            }
            violations.push({
                kind: "reversed-layer-dependency",
                file: toRelativePath(rootDir, file),
                line: imported.line,
                message: `${owner.name} (${owner.layer}) cannot import ${target.name} (${target.layer}) through ${imported.specifier}`,
            });
        }
        return;
    }
    const parsed = parseWorkspaceSpecifier(imported.specifier, packageByName);
    if (!parsed || layerRank(owner.layer) >= layerRank(parsed.pkg.layer)) {
        return;
    }
    violations.push({
        kind: "reversed-layer-dependency",
        file: toRelativePath(rootDir, file),
        line: imported.line,
        message: `${owner.name} (${owner.layer}) cannot import ${parsed.pkg.name} (${parsed.pkg.layer})`,
    });
}

export function checkCrossPackageSourceImport(
    owner: WorkspacePackage,
    file: string,
    imported: SourceImport,
    packageByRoot: readonly WorkspacePackage[],
    sourceFiles: ReadonlySet<string>,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    const specifier = imported.specifier.replaceAll("\\", "/");
    const targetPaths = resolvePackageAliasImports(owner, imported.specifier, sourceFiles);
    if (targetPaths.length === 0 && specifier.startsWith(".")) {
        targetPaths.push(resolve(dirname(file), specifier));
    } else if (targetPaths.length === 0 && isAbsolute(specifier)) {
        targetPaths.push(normalize(specifier));
    } else if (
        /(?:^|\/)packages\/(?:foundation|features|resources|surfaces|runtimes)\/[^/]+\/src(?:\/|$)/.test(specifier)
    ) {
        targetPaths.push(resolve(rootDir, specifier));
    }
    for (const targetPath of targetPaths) {
        const target = packageByRoot.find((pkg) => isPathInside(targetPath, pkg.root));
        if (!target || target.name === owner.name || !isPathInside(targetPath, join(target.root, "src"))) {
            continue;
        }
        violations.push({
            kind: "cross-package-source-import",
            file: toRelativePath(rootDir, file),
            line: imported.line,
            message: `${owner.name} imports ${target.name} through its src/ tree (${imported.specifier})`,
        });
    }
}

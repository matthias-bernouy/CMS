import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ArchitectureViolation, SourceImport, WorkspaceCheckOptions } from "./architectureTypes";
import {
    DEFAULT_ADAPTER_SUBPATHS,
    DEFAULT_INFRASTRUCTURE_MODULES,
} from "./architectureTypes";
import { checkBrowserEntrypoints } from "./browserRules";
import { collectCodeFilesFromRoots } from "./codeFiles";
import { checkManifestLayerDependencies, checkWorkspaceCycles } from "./dependencyRules";
import { checkEnvironmentReads } from "./environmentRule";
import { checkFocusedTests } from "./focusedTestRule";
import { checkGeneratedAsset } from "./generatedAssetRule";
import {
    checkCrossPackageSourceImport,
    checkExportFilesDeclared,
    checkImportedLayer,
    checkImportedWorkspaceSubpath,
} from "./packageBoundaryRules";
import { normalizeRelativePath } from "./pathUtils";
import { checkSurfaceAdapters } from "./runtimeAdapterRules";
import { collectImports, createSourceFile } from "./sourceImports";
import { finalizeViolations } from "./violations";
import { discoverWorkspacePackages } from "./workspaceDiscovery";

export {
    type ArchitectureViolation,
    type ArchitectureViolationKind,
    type GeneratedAssetCheck,
    WORKSPACE_LAYERS,
    type WorkspaceCheckOptions,
    type WorkspaceLayer,
} from "./architectureTypes";
export { formatArchitectureViolations } from "./violations";

export async function checkWorkspaceArchitecture(
    options: WorkspaceCheckOptions,
): Promise<ArchitectureViolation[]> {
    const rootDir = resolve(options.rootDir);
    const ignoredPaths = (options.ignoredPaths ?? []).map(normalizeRelativePath);
    const packages = await discoverWorkspacePackages(rootDir, ignoredPaths);
    const packageByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
    const packageByRoot = [...packages].sort((a, b) => b.root.length - a.root.length);
    const allSourceFiles = new Set(packages.flatMap((pkg) => pkg.sourceFiles));
    const violations: ArchitectureViolation[] = [];

    checkManifestLayerDependencies(packages, packageByName, violations);
    checkWorkspaceCycles(packages, packageByName, violations);
    checkExportFilesDeclared(packages, violations);

    const importsByFile = new Map<string, SourceImport[]>();
    for (const pkg of packages) {
        for (const file of pkg.sourceFiles) {
            const source = await readFile(file, "utf8");
            const sourceFile = createSourceFile(file, source);
            const imports = collectImports(sourceFile);
            importsByFile.set(file, imports);
            checkPackageImports(
                pkg,
                file,
                imports,
                packageByName,
                packageByRoot,
                allSourceFiles,
                violations,
                rootDir,
            );

            if (!isTestFile(file) && pkg.layer === "surfaces") {
                checkSurfaceAdapters(
                    file,
                    imports,
                    options.adapterSubpaths ?? DEFAULT_ADAPTER_SUBPATHS,
                    options.infrastructureModules ?? DEFAULT_INFRASTRUCTURE_MODULES,
                    packageByName,
                    violations,
                    rootDir,
                );
            }
            if (!isTestFile(file) && pkg.layer !== "runtimes") {
                checkEnvironmentReads(
                    file,
                    sourceFile,
                    options.environmentReadBaseline ?? {},
                    violations,
                    rootDir,
                );
            }
        }
    }

    await checkBrowserEntrypoints(
        packages,
        importsByFile,
        options.browserEntryPaths ?? [],
        options.adapterSubpaths ?? DEFAULT_ADAPTER_SUBPATHS,
        options.infrastructureModules ?? DEFAULT_INFRASTRUCTURE_MODULES,
        violations,
        rootDir,
    );
    await checkTests(rootDir, ignoredPaths, violations);
    for (const asset of options.generatedAssets ?? []) {
        await checkGeneratedAsset(rootDir, asset, violations);
    }
    return finalizeViolations(violations);
}

function checkPackageImports(
    owner: Parameters<typeof checkImportedWorkspaceSubpath>[0],
    file: string,
    imports: readonly SourceImport[],
    packageByName: Parameters<typeof checkImportedWorkspaceSubpath>[3],
    packageByRoot: Parameters<typeof checkImportedLayer>[4],
    sourceFiles: ReadonlySet<string>,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    for (const imported of imports) {
        checkImportedWorkspaceSubpath(owner, file, imported, packageByName, violations, rootDir);
        checkCrossPackageSourceImport(owner, file, imported, packageByRoot, sourceFiles, violations, rootDir);
        checkImportedLayer(
            owner, file, imported, packageByName, packageByRoot, sourceFiles, violations, rootDir,
        );
    }
}

async function checkTests(
    rootDir: string,
    ignoredPaths: readonly string[],
    violations: ArchitectureViolation[],
): Promise<void> {
    const files = await collectCodeFilesFromRoots([rootDir], rootDir, ignoredPaths);
    for (const file of files.filter(isTestFile)) {
        const source = await readFile(file, "utf8");
        checkFocusedTests(file, createSourceFile(file, source), violations, rootDir);
    }
}

function isTestFile(file: string): boolean {
    const normalized = file.replaceAll("\\", "/");
    return /\/(?:test|tests|__tests__)\//.test(normalized)
        || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized);
}

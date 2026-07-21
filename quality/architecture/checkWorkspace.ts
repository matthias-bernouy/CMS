import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { builtinModules } from "node:module";
import * as ts from "typescript";

export const WORKSPACE_LAYERS = [
    "foundation",
    "features",
    "resources",
    "surfaces",
    "runtimes",
] as const;

export type WorkspaceLayer = typeof WORKSPACE_LAYERS[number];

export type ArchitectureViolationKind =
    | "reversed-layer-dependency"
    | "workspace-cycle"
    | "undeclared-subpath"
    | "cross-package-source-import"
    | "surface-runtime-adapter"
    | "browser-runtime-adapter"
    | "environment-read"
    | "focused-test"
    | "generated-asset-drift";

export interface ArchitectureViolation {
    kind: ArchitectureViolationKind;
    message: string;
    file?: string;
    line?: number;
}

export interface GeneratedAssetCheck {
    path: string;
    generate: () => Promise<string>;
    normalize?: (contents: string) => string;
}

export interface WorkspaceCheckOptions {
    rootDir: string;
    /** Repository-relative paths ignored by all source scans. */
    ignoredPaths?: readonly string[];
    /** Extra repository-relative browser entrypoints, including generated bundles. */
    browserEntryPaths?: readonly string[];
    /** Existing non-runtime reads. Counts are a ratchet: missing reads are fine, extra reads fail. */
    environmentReadBaseline?: Readonly<Record<string, Readonly<Record<string, number>>>>;
    generatedAssets?: readonly GeneratedAssetCheck[];
    adapterSubpaths?: readonly string[];
    infrastructureModules?: readonly string[];
}

interface PackageManifest {
    name?: string;
    exports?: unknown;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

interface WorkspacePackage {
    name: string;
    layer: WorkspaceLayer;
    root: string;
    relativeRoot: string;
    manifest: PackageManifest;
    sourceFiles: string[];
    pathAliases: PackagePathAlias[];
}

interface PackagePathAlias {
    pattern: string;
    targets: string[];
    baseDir: string;
}

interface SourceImport {
    specifier: string;
    line: number;
    typeOnly: boolean;
}

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const DEFAULT_ADAPTER_SUBPATHS = [
    "fs",
    "http",
    "mongo",
    "mongodb",
    "node",
    "postgres",
    "postgresql",
    "redis",
    "s3",
    "supabase",
];
const DEFAULT_INFRASTRUCTURE_MODULES = ["mongodb", "pg", "postgres", "redis", "ioredis", "minio", "mysql2"];
const NODE_BUILTINS = new Set(builtinModules.map((module) => module.replace(/^node:/, "")));
const IGNORED_DIRECTORY_NAMES = new Set([
    ".git",
    ".coverage-rate",
    "coverage",
    "dist",
    "node_modules",
]);

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

            for (const imported of imports) {
                checkImportedWorkspaceSubpath(pkg, file, imported, packageByName, violations, rootDir);
                checkCrossPackageSourceImport(
                    pkg,
                    file,
                    imported,
                    packageByRoot,
                    allSourceFiles,
                    violations,
                    rootDir,
                );
                checkImportedLayer(
                    pkg,
                    file,
                    imported,
                    packageByName,
                    packageByRoot,
                    allSourceFiles,
                    violations,
                    rootDir,
                );
            }

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

    const testScanRoots = [rootDir];
    const testFiles = await collectCodeFilesFromRoots(testScanRoots, rootDir, ignoredPaths);
    for (const file of testFiles.filter(isTestFile)) {
        const source = await readFile(file, "utf8");
        checkFocusedTests(file, createSourceFile(file, source), violations, rootDir);
    }

    for (const asset of options.generatedAssets ?? []) {
        await checkGeneratedAsset(rootDir, asset, violations);
    }

    return deduplicateViolations(violations).sort(compareViolations);
}

export function formatArchitectureViolations(violations: readonly ArchitectureViolation[]): string {
    return violations.map((violation) => {
        const location = violation.file
            ? `${violation.file}${violation.line ? `:${violation.line}` : ""}: `
            : "";
        return `[${violation.kind}] ${location}${violation.message}`;
    }).join("\n");
}

async function discoverWorkspacePackages(
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

            const manifestPath = join(packageRoot, "package.json");
            let manifest: PackageManifest;
            try {
                manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PackageManifest;
            } catch (error) {
                if (isMissingPathError(error)) continue;
                throw error;
            }
            if (!manifest.name) continue;

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

async function readPackagePathAliases(packageRoot: string, packageName: string): Promise<PackagePathAlias[]> {
    const aliases: PackagePathAlias[] = [];
    const tsconfigPath = join(packageRoot, "tsconfig.json");
    try {
        const parsed = ts.parseConfigFileTextToJson(tsconfigPath, await readFile(tsconfigPath, "utf8"));
        if (parsed.error) {
            throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
        }
        const compilerOptions = parsed.config?.compilerOptions as {
            baseUrl?: unknown;
            paths?: unknown;
        } | undefined;
        const baseUrl = typeof compilerOptions?.baseUrl === "string"
            ? resolve(packageRoot, compilerOptions.baseUrl)
            : packageRoot;
        if (compilerOptions?.paths && typeof compilerOptions.paths === "object") {
            for (const [pattern, rawTargets] of Object.entries(compilerOptions.paths as Record<string, unknown>)) {
                if (!Array.isArray(rawTargets)) continue;
                const targets = rawTargets.filter((target): target is string => typeof target === "string");
                if (targets.length > 0) aliases.push({ pattern, targets, baseDir: baseUrl });
            }
        }
    } catch (error) {
        if (!isMissingPathError(error)) throw error;
    }

    const conventionalName = packageName.split("/").at(-1)!;
    if (!aliases.some(({ pattern }) => pattern === conventionalName || pattern.startsWith(`${conventionalName}/`))) {
        aliases.push({
            pattern: `${conventionalName}/*`,
            targets: ["src/*", "*"],
            baseDir: packageRoot,
        });
    }
    return aliases;
}

async function collectCodeFilesFromRoots(
    roots: readonly string[],
    repositoryRoot: string,
    ignoredPaths: readonly string[],
): Promise<string[]> {
    const files = new Set<string>();
    for (const root of roots) {
        for (const file of await collectCodeFiles(root, repositoryRoot, ignoredPaths)) files.add(file);
    }
    return [...files].sort();
}

async function collectCodeFiles(
    root: string,
    repositoryRoot: string,
    ignoredPaths: readonly string[],
): Promise<string[]> {
    const files: string[] = [];

    async function visit(directory: string): Promise<void> {
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch (error) {
            if (isMissingPathError(error)) return;
            throw error;
        }

        for (const entry of entries) {
            const absolutePath = join(directory, entry.name);
            const relativePath = toRelativePath(repositoryRoot, absolutePath);
            if (isIgnored(relativePath, ignoredPaths)) continue;
            if (entry.isDirectory()) {
                if (IGNORED_DIRECTORY_NAMES.has(entry.name)) continue;
                await visit(absolutePath);
            } else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) {
                if (entry.name.endsWith(".d.ts")) continue;
                files.push(absolutePath);
            }
        }
    }

    await visit(root);
    return files.sort();
}

function checkManifestLayerDependencies(
    packages: readonly WorkspacePackage[],
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    violations: ArchitectureViolation[],
): void {
    for (const pkg of packages) {
        for (const dependency of workspaceDependencies(pkg.manifest)) {
            const target = packageByName.get(dependency);
            if (!target || layerRank(pkg.layer) >= layerRank(target.layer)) continue;
            violations.push({
                kind: "reversed-layer-dependency",
                file: `${pkg.relativeRoot}/package.json`,
                message: `${pkg.name} (${pkg.layer}) cannot depend on ${target.name} (${target.layer})`,
            });
        }
    }
}

function checkWorkspaceCycles(
    packages: readonly WorkspacePackage[],
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    violations: ArchitectureViolation[],
): void {
    const edges = new Map<string, string[]>();
    for (const pkg of packages) {
        edges.set(pkg.name, workspaceDependencies(pkg.manifest).filter((name) => packageByName.has(name)));
    }

    let nextIndex = 0;
    const indexes = new Map<string, number>();
    const lowLinks = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();

    const visit = (name: string): void => {
        indexes.set(name, nextIndex);
        lowLinks.set(name, nextIndex);
        nextIndex += 1;
        stack.push(name);
        onStack.add(name);

        for (const target of edges.get(name) ?? []) {
            if (!indexes.has(target)) {
                visit(target);
                lowLinks.set(name, Math.min(lowLinks.get(name)!, lowLinks.get(target)!));
            } else if (onStack.has(target)) {
                lowLinks.set(name, Math.min(lowLinks.get(name)!, indexes.get(target)!));
            }
        }

        if (lowLinks.get(name) !== indexes.get(name)) return;
        const component: string[] = [];
        let popped: string;
        do {
            popped = stack.pop()!;
            onStack.delete(popped);
            component.push(popped);
        } while (popped !== name);

        const selfCycle = component.length === 1 && (edges.get(component[0]!) ?? []).includes(component[0]!);
        if (component.length > 1 || selfCycle) {
            const cycle = component.sort();
            violations.push({
                kind: "workspace-cycle",
                message: `workspace dependency cycle: ${cycle.join(" -> ")}`,
            });
        }
    };

    for (const pkg of packages) if (!indexes.has(pkg.name)) visit(pkg.name);
}

function checkExportFilesDeclared(
    packages: readonly WorkspacePackage[],
    violations: ArchitectureViolation[],
): void {
    for (const pkg of packages) {
        for (const file of pkg.sourceFiles) {
            const exportFile = toRelativePath(join(pkg.root, "src", "exports"), file);
            const extension = extname(exportFile);
            if (exportFile.startsWith("../") || !CODE_EXTENSIONS.has(extension)) continue;
            const name = exportFile.slice(0, -extension.length);
            const subpath = name === "index" ? "."
                : name.endsWith("/index") ? `./${name.slice(0, -"/index".length)}`
                    : `./${name}`;
            if (isDeclaredExport(pkg.manifest.exports, subpath)) continue;
            violations.push({
                kind: "undeclared-subpath",
                file: `${pkg.relativeRoot}/src/exports/${exportFile}`,
                message: `${pkg.name} export file is not declared as ${subpath} in package.json`,
            });
        }
    }
}

function checkImportedWorkspaceSubpath(
    owner: WorkspacePackage,
    file: string,
    imported: SourceImport,
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    const parsed = parseWorkspaceSpecifier(imported.specifier, packageByName);
    if (!parsed) return;
    const exportedSubpath = parsed.subpath ? `./${parsed.subpath}` : ".";
    if (isDeclaredExport(parsed.pkg.manifest.exports, exportedSubpath)) return;

    violations.push({
        kind: "undeclared-subpath",
        file: toRelativePath(rootDir, file),
        line: imported.line,
        message: `${owner.name} imports ${imported.specifier}, but ${exportedSubpath} is not declared by ${parsed.pkg.name}`,
    });
}

function checkImportedLayer(
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
            if (!target || layerRank(owner.layer) >= layerRank(target.layer)) continue;
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
    if (!parsed || layerRank(owner.layer) >= layerRank(parsed.pkg.layer)) return;
    violations.push({
        kind: "reversed-layer-dependency",
        file: toRelativePath(rootDir, file),
        line: imported.line,
        message: `${owner.name} (${owner.layer}) cannot import ${parsed.pkg.name} (${parsed.pkg.layer})`,
    });
}

function checkCrossPackageSourceImport(
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
    if (targetPaths.length === 0 && specifier.startsWith(".")) targetPaths.push(resolve(dirname(file), specifier));
    else if (targetPaths.length === 0 && isAbsolute(specifier)) targetPaths.push(normalize(specifier));
    else if (/(?:^|\/)packages\/(?:foundation|features|resources|surfaces|runtimes)\/[^/]+\/src(?:\/|$)/.test(specifier)) {
        targetPaths.push(resolve(rootDir, specifier));
    }
    for (const targetPath of targetPaths) {
        const target = packageByRoot.find((pkg) => isPathInside(targetPath, pkg.root));
        if (!target || target.name === owner.name || !isPathInside(targetPath, join(target.root, "src"))) continue;
        violations.push({
            kind: "cross-package-source-import",
            file: toRelativePath(rootDir, file),
            line: imported.line,
            message: `${owner.name} imports ${target.name} through its src/ tree (${imported.specifier})`,
        });
    }
}

function checkSurfaceAdapters(
    file: string,
    imports: readonly SourceImport[],
    adapterSubpaths: readonly string[],
    infrastructureModules: readonly string[],
    packageByName: ReadonlyMap<string, WorkspacePackage>,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    for (const imported of imports) {
        if (!isRuntimeAdapter(imported.specifier, adapterSubpaths, infrastructureModules, false, packageByName)) continue;
        violations.push({
            kind: "surface-runtime-adapter",
            file: toRelativePath(rootDir, file),
            line: imported.line,
            message: `surface code imports runtime adapter ${imported.specifier}`,
        });
    }
}

async function checkBrowserEntrypoints(
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
    const entries = new Set<string>();
    for (const pkg of packages) {
        for (const entry of inferredBrowserEntries(pkg)) entries.add(entry);
        for (const file of pkg.sourceFiles) if (/\.client\.[cm]?[jt]sx?$/.test(file)) entries.add(file);
    }
    for (const entry of configuredEntries) entries.add(resolve(rootDir, entry));

    const sourceFiles = new Set(importsByFile.keys());
    const visited = new Set<string>();
    const pending = [...entries].filter((entry) => sourceFiles.has(entry));
    while (pending.length > 0) {
        const file = pending.pop()!;
        if (visited.has(file)) continue;
        visited.add(file);

        for (const imported of importsByFile.get(file) ?? []) {
            if (imported.typeOnly) continue;
            if (isRuntimeAdapter(imported.specifier, adapterSubpaths, infrastructureModules, true, packageByName)) {
                violations.push({
                    kind: "browser-runtime-adapter",
                    file: toRelativePath(rootDir, file),
                    line: imported.line,
                    message: `browser entry imports server/runtime module ${imported.specifier}`,
                });
            }
            for (const resolved of resolveBrowserImport(
                file,
                imported.specifier,
                sourceFiles,
                packageByName,
                packageByRoot,
            )) {
                pending.push(resolved);
            }
        }
    }
}

function checkEnvironmentReads(
    file: string,
    sourceFile: ts.SourceFile,
    baseline: Readonly<Record<string, Readonly<Record<string, number>>>>,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    const relativeFile = toRelativePath(rootDir, file);
    const allowed = baseline[relativeFile] ?? {};
    const seen = new Map<string, number>();

    for (const read of collectEnvironmentReads(sourceFile)) {
        const occurrence = (seen.get(read.expression) ?? 0) + 1;
        seen.set(read.expression, occurrence);
        if (occurrence <= (allowed[read.expression] ?? 0)) continue;
        violations.push({
            kind: "environment-read",
            file: relativeFile,
            line: read.line,
            message: `environment read outside a runtime is not in the ratchet: ${read.expression}`,
        });
    }
}

function checkFocusedTests(
    file: string,
    sourceFile: ts.SourceFile,
    violations: ArchitectureViolation[],
    rootDir: string,
): void {
    const bindings = collectBunTestBindings(sourceFile);
    const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
            const focused = focusedTestCall(node.expression, bindings.aliases, bindings.namespaces);
            if (focused) {
                violations.push({
                    kind: "focused-test",
                    file: toRelativePath(rootDir, file),
                    line: lineOf(sourceFile, node),
                    message: `${focused} must not be committed`,
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
}

function collectBunTestBindings(sourceFile: ts.SourceFile): {
    aliases: Map<string, string>;
    namespaces: Set<string>;
} {
    const aliases = new Map<string, string>();
    const namespaces = new Set<string>();
    const supported = new Set(["test", "it", "describe", "suite"]);
    for (const statement of sourceFile.statements) {
        if (
            !ts.isImportDeclaration(statement)
            || !ts.isStringLiteralLike(statement.moduleSpecifier)
            || statement.moduleSpecifier.text !== "bun:test"
            || !statement.importClause?.namedBindings
        ) continue;
        const bindings = statement.importClause.namedBindings;
        if (ts.isNamespaceImport(bindings)) {
            namespaces.add(bindings.name.text);
            continue;
        }
        for (const element of bindings.elements) {
            const imported = element.propertyName?.text ?? element.name.text;
            if (supported.has(imported)) aliases.set(element.name.text, imported);
        }
    }
    return { aliases, namespaces };
}

async function checkGeneratedAsset(
    rootDir: string,
    check: GeneratedAssetCheck,
    violations: ArchitectureViolation[],
): Promise<void> {
    const assetPath = resolve(rootDir, check.path);
    let tracked: string;
    try {
        tracked = await readFile(assetPath, "utf8");
    } catch (error) {
        if (!isMissingPathError(error)) throw error;
        violations.push({
            kind: "generated-asset-drift",
            file: normalizeRelativePath(check.path),
            message: "generated asset is missing",
        });
        return;
    }

    const generated = await check.generate();
    const normalizeContents = check.normalize ?? ((contents: string) => contents);
    if (normalizeContents(tracked) === normalizeContents(generated)) return;
    violations.push({
        kind: "generated-asset-drift",
        file: normalizeRelativePath(check.path),
        message: "tracked generated asset differs from a fresh build",
    });
}

function collectImports(sourceFile: ts.SourceFile): SourceImport[] {
    const imports: SourceImport[] = [];
    const add = (literal: ts.StringLiteralLike, typeOnly = false): void => {
        imports.push({ specifier: literal.text, line: lineOf(sourceFile, literal), typeOnly });
    };
    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
            add(node.moduleSpecifier, isTypeOnlyImport(node));
        }
        else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
            add(node.moduleSpecifier, isTypeOnlyExport(node));
        } else if (
            ts.isImportTypeNode(node)
            && ts.isLiteralTypeNode(node.argument)
            && ts.isStringLiteralLike(node.argument.literal)
        ) {
            add(node.argument.literal, true);
        } else if (
            ts.isImportEqualsDeclaration(node)
            && ts.isExternalModuleReference(node.moduleReference)
            && node.moduleReference.expression
            && ts.isStringLiteralLike(node.moduleReference.expression)
        ) {
            add(node.moduleReference.expression, node.isTypeOnly);
        } else if (ts.isCallExpression(node) && node.arguments.length >= 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
            if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]!);
            else if (
                node.arguments.length === 1
                && ts.isIdentifier(node.expression)
                && node.expression.text === "require"
            ) {
                add(node.arguments[0]!);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return imports;
}

function isTypeOnlyImport(declaration: ts.ImportDeclaration): boolean {
    const clause = declaration.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
    return clause.namedBindings.elements.length > 0
        && clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function isTypeOnlyExport(declaration: ts.ExportDeclaration): boolean {
    if (declaration.isTypeOnly) return true;
    if (!declaration.exportClause || !ts.isNamedExports(declaration.exportClause)) return false;
    return declaration.exportClause.elements.length > 0
        && declaration.exportClause.elements.every((element) => element.isTypeOnly);
}

function collectEnvironmentReads(sourceFile: ts.SourceFile): Array<{ expression: string; line: number }> {
    const reads: Array<{ expression: string; line: number }> = [];
    const visit = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
            const owner = environmentOwnerName(node.initializer);
            if (owner) {
                for (const element of node.name.elements) {
                    const property = element.propertyName ?? element.name;
                    if (bindingPropertyName(property) !== "env") continue;
                    reads.push({ expression: `${owner}.env`, line: lineOf(sourceFile, element) });
                }
            }
        }
        if (isEnvironmentObject(node)) {
            const parent = node.parent;
            if (!parent || !isAccessOnExpression(parent, node)) {
                reads.push({ expression: compactExpression(node.getText(sourceFile)), line: lineOf(sourceFile, node) });
            }
        } else if (
            (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
            && isEnvironmentObject(node.expression)
        ) {
            reads.push({ expression: compactExpression(node.getText(sourceFile)), line: lineOf(sourceFile, node) });
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return reads;
}

function isEnvironmentObject(node: ts.Node): boolean {
    if (!isPropertyAccessNamed(node, "env")) return false;
    const owner = node.expression;
    if (environmentOwnerName(owner)) return true;
    return ts.isMetaProperty(owner)
        && owner.keywordToken === ts.SyntaxKind.ImportKeyword
        && owner.name.text === "meta";
}

function environmentOwnerName(node: ts.Expression): string | undefined {
    if (ts.isIdentifier(node) && (node.text === "process" || node.text === "Bun")) return node.text;
    if (
        isPropertyAccessNamed(node, "process")
        && ts.isIdentifier(node.expression)
        && node.expression.text === "globalThis"
    ) {
        return "globalThis.process";
    }
    return undefined;
}

function bindingPropertyName(node: ts.BindingName | ts.PropertyName): string | undefined {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
    return undefined;
}

function isPropertyAccessNamed(
    node: ts.Node,
    name: string,
): node is ts.PropertyAccessExpression | ts.ElementAccessExpression {
    if (ts.isPropertyAccessExpression(node)) return node.name.text === name;
    if (!ts.isElementAccessExpression(node) || !node.argumentExpression) return false;
    return ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === name;
}

function isAccessOnExpression(parent: ts.Node, expression: ts.Node): boolean {
    return (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent))
        && parent.expression === expression;
}

function focusedTestCall(
    expression: ts.LeftHandSideExpression,
    aliases: ReadonlyMap<string, string>,
    namespaces: ReadonlySet<string>,
): string | undefined {
    if (ts.isIdentifier(expression) && (expression.text === "fit" || expression.text === "fdescribe")) {
        return `${expression.text}(...)`;
    }
    const chain = callChain(expression);
    if (!chain) return undefined;
    let testFunction = aliases.get(chain.root) ?? chain.root;
    let members = chain.members;
    if (namespaces.has(chain.root)) {
        const [namespaceMember, ...rest] = members;
        if (!namespaceMember) return undefined;
        testFunction = namespaceMember;
        members = rest;
    }
    if (!new Set(["test", "it", "describe", "suite"]).has(testFunction)) return undefined;
    const modifier = members.find((member) => member === "only" || member === "focus");
    return modifier ? `${testFunction}.${modifier}(...)` : undefined;
}

function callChain(expression: ts.Expression): { root: string; members: string[] } | undefined {
    if (ts.isIdentifier(expression)) return { root: expression.text, members: [] };
    if (ts.isCallExpression(expression)) return callChain(expression.expression);
    if (ts.isPropertyAccessExpression(expression)) {
        const chain = callChain(expression.expression);
        if (chain) chain.members.push(expression.name.text);
        return chain;
    }
    if (
        ts.isElementAccessExpression(expression)
        && expression.argumentExpression
        && ts.isStringLiteralLike(expression.argumentExpression)
    ) {
        const chain = callChain(expression.expression);
        if (chain) chain.members.push(expression.argumentExpression.text);
        return chain;
    }
    return undefined;
}

function inferredBrowserEntries(pkg: WorkspacePackage): string[] {
    const entries: string[] = [];
    if (pkg.name.split("/").at(-1) === "components") {
        for (const target of declaredExportTargets(pkg.manifest.exports, ".")) {
            if (target.endsWith(".d.ts")) continue;
            entries.push(resolveExportSourceTarget(pkg, target, new Set(pkg.sourceFiles)) ?? resolve(pkg.root, target));
        }
        entries.push(resolve(pkg.root, "src/index.ts"));
    }
    if (!pkg.manifest.exports || typeof pkg.manifest.exports !== "object") return entries;
    const exportsMap = pkg.manifest.exports as Record<string, unknown>;
    for (const [subpath, value] of Object.entries(exportsMap)) {
        const browserNamed = /(?:browser|client|component|editor)/i.test(subpath);
        const browserCondition = hasObjectKey(value, "browser");
        if (!browserNamed && !browserCondition) continue;
        for (const target of exportTargets(value)) {
            if (target.endsWith(".d.ts")) continue;
            entries.push(resolveExportSourceTarget(pkg, target, new Set(pkg.sourceFiles)) ?? resolve(pkg.root, target));
        }
    }
    return entries;
}

function exportTargets(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const object = value as Record<string, unknown>;
    for (const preferred of ["browser", "bun", "import", "default"]) {
        if (preferred in object) return exportTargets(object[preferred]);
    }
    return Object.values(object).flatMap(exportTargets);
}

function declaredExportTargets(exportsValue: unknown, subpath: string): string[] {
    if (typeof exportsValue === "string") return subpath === "." ? [exportsValue] : [];
    if (!exportsValue || typeof exportsValue !== "object" || Array.isArray(exportsValue)) return [];
    const exportsMap = exportsValue as Record<string, unknown>;
    const subpathKeys = Object.keys(exportsMap).filter((key) => key.startsWith("."));
    if (subpathKeys.length === 0) return subpath === "." ? exportTargets(exportsValue) : [];

    const exact = exportsMap[subpath];
    if (exact !== undefined) return exportTargets(exact);
    for (const key of subpathKeys) {
        if (!key.includes("*")) continue;
        const wildcard = matchPattern(key, subpath);
        if (wildcard === undefined) continue;
        return exportTargets(exportsMap[key]).map((target) => target.replaceAll("*", wildcard));
    }
    return [];
}

function hasObjectKey(value: unknown, key: string): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    return key in object || Object.values(object).some((nested) => hasObjectKey(nested, key));
}

function isRuntimeAdapter(
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
    if (infrastructureModules.some((module) => specifier === module || specifier.startsWith(`${module}/`))) return true;
    if (specifier.startsWith("@aws-sdk/")) return true;

    const workspaceImport = parseWorkspaceSpecifier(specifier, packageByName);
    if (!workspaceImport) return false;
    const subpathSegments = workspaceImport.subpath.replaceAll("\\", "/").split("/");
    return subpathSegments.some((segment) => adapterSubpaths.includes(segment.toLowerCase()));
}

function resolveBrowserImport(
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
    if (workspaceImport) {
        const subpath = workspaceImport.subpath ? `./${workspaceImport.subpath}` : ".";
        return declaredExportTargets(workspaceImport.pkg.manifest.exports, subpath)
            .map((target) => resolveExportSourceTarget(workspaceImport.pkg, target, sourceFiles))
            .filter((target): target is string => target !== undefined);
    }

    return [];
}

function resolvePackageAliasImports(
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

function resolveSourcePath(base: string, sourceFiles: ReadonlySet<string>): string | undefined {
    const emittedExtension = extname(base);
    const sourceStem = new Set([".js", ".jsx", ".mjs", ".cjs"]).has(emittedExtension)
        ? base.slice(0, -emittedExtension.length)
        : undefined;
    const candidates = [
        base,
        ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].map((extension) => `${base}${extension}`),
        ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].map((extension) => join(base, `index${extension}`)),
        ...(sourceStem
            ? [".ts", ".tsx", ".mts", ".cts"].map((extension) => `${sourceStem}${extension}`)
            : []),
    ];
    return candidates.find((candidate) => sourceFiles.has(candidate));
}

function resolveExportSourceTarget(
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

function matchPattern(pattern: string, value: string): string | undefined {
    const wildcardIndex = pattern.indexOf("*");
    if (wildcardIndex < 0) return pattern === value ? "" : undefined;
    const prefix = pattern.slice(0, wildcardIndex);
    const suffix = pattern.slice(wildcardIndex + 1);
    if (!value.startsWith(prefix) || !value.endsWith(suffix)) return undefined;
    return value.slice(prefix.length, value.length - suffix.length);
}

function parseWorkspaceSpecifier(
    specifier: string,
    packageByName: ReadonlyMap<string, WorkspacePackage>,
): { pkg: WorkspacePackage; subpath: string } | undefined {
    for (const [name, pkg] of packageByName) {
        if (specifier === name) return { pkg, subpath: "" };
        if (specifier.startsWith(`${name}/`)) return { pkg, subpath: specifier.slice(name.length + 1) };
    }
    return undefined;
}

function isDeclaredExport(exportsValue: unknown, subpath: string): boolean {
    return declaredExportTargets(exportsValue, subpath).length > 0;
}

function workspaceDependencies(manifest: PackageManifest): string[] {
    return [...new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
    ])].sort();
}

function layerRank(layer: WorkspaceLayer): number {
    return WORKSPACE_LAYERS.indexOf(layer);
}

function createSourceFile(file: string, source: string): ts.SourceFile {
    const scriptKind = /\.[cm]?tsx$/.test(file) ? ts.ScriptKind.TSX
        : /\.[cm]?jsx$/.test(file) ? ts.ScriptKind.JSX
            : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS
                : ts.ScriptKind.TS;
    return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isTestFile(file: string): boolean {
    const normalized = file.replaceAll("\\", "/");
    return /\/(?:test|tests|__tests__)\//.test(normalized)
        || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalized);
}

function compactExpression(expression: string): string {
    return expression.replace(/\s+/g, "");
}

function normalizeRelativePath(path: string): string {
    return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function toRelativePath(rootDir: string, path: string): string {
    return normalizeRelativePath(relative(rootDir, path));
}

function isIgnored(path: string, ignoredPaths: readonly string[]): boolean {
    const normalized = normalizeRelativePath(path);
    return ignoredPaths.some((ignored) => normalized === ignored || normalized.startsWith(`${ignored}/`));
}

function isPathInside(path: string, parent: string): boolean {
    const relation = relative(parent, path);
    return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function deduplicateViolations(violations: readonly ArchitectureViolation[]): ArchitectureViolation[] {
    const seen = new Set<string>();
    return violations.filter((violation) => {
        const key = `${violation.kind}\0${violation.file ?? ""}\0${violation.line ?? ""}\0${violation.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function compareViolations(a: ArchitectureViolation, b: ArchitectureViolation): number {
    return (a.file ?? "").localeCompare(b.file ?? "")
        || (a.line ?? 0) - (b.line ?? 0)
        || a.kind.localeCompare(b.kind)
        || a.message.localeCompare(b.message);
}

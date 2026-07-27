import type { CanonicalFile, CanonicalFileSet } from "@bernouy/cms-integration-packages";
import type * as TypeScript from "typescript";
import { collectVerificationModulePaths, invalidVerificationSourceReference } from "./suiteImports";
import { assertVerificationSourceGlobals } from "./suiteGlobals";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const;
const DATA_EXTENSIONS = [".json"] as const;

export type VerificationSuiteSource = Readonly<{ path: string; file: CanonicalFile }>;

let typescriptModule: Promise<typeof TypeScript> | undefined;

export async function collectVerificationSuiteSourceClosure(
    files: CanonicalFileSet,
    entrypoint: string,
): Promise<readonly VerificationSuiteSource[]> {
    const compiler = await loadTypeScript();
    const pending = [entrypoint];
    const visited = new Set<string>();
    while (pending.length > 0) {
        const path = pending.pop()!;
        if (visited.has(path)) {
            continue;
        }
        const file = requiredSourceFile(files, path, path === entrypoint);
        visited.add(path);
        if (isDataModule(path)) {
            continue;
        }
        const sourceFile = parseSourceFile(compiler, path, file.content);
        assertVerificationSourceGlobals(compiler, sourceFile, path);
        for (const dependency of collectVerificationModulePaths(compiler, sourceFile, files, path)) {
            pending.push(dependency);
        }
    }
    return Object.freeze([...visited].toSorted(compareText).map((path) => Object.freeze({ path, file: files[path]! })));
}

async function loadTypeScript(): Promise<typeof TypeScript> {
    typescriptModule ??= import("typescript");
    return await typescriptModule;
}

function requiredSourceFile(files: CanonicalFileSet, path: string, entrypoint: boolean): CanonicalFile {
    const file = Object.hasOwn(files, path) ? files[path] : undefined;
    if (!file) {
        throw invalidVerificationSourceReference(path, "does not reference an exact bundle file");
    }
    if (file.encoding !== "utf8") {
        throw invalidVerificationSourceReference(path, "must reference a UTF-8 module");
    }
    if (!isSourceModule(path) && !(isDataModule(path) && !entrypoint)) {
        throw invalidVerificationSourceReference(
            path,
            entrypoint ? "must be a TypeScript or JavaScript module" : "has an unsupported module type",
        );
    }
    return file;
}

function parseSourceFile(compiler: typeof TypeScript, path: string, source: string): TypeScript.SourceFile {
    const sourceFile = compiler.createSourceFile(
        path,
        source,
        compiler.ScriptTarget.Latest,
        true,
        scriptKind(compiler, path),
    );
    const diagnostics = (sourceFile as TypeScript.SourceFile & { parseDiagnostics?: readonly TypeScript.Diagnostic[] })
        .parseDiagnostics;
    if (diagnostics && diagnostics.length > 0) {
        const message = compiler.flattenDiagnosticMessageText(diagnostics[0]!.messageText, " ");
        throw invalidVerificationSourceReference(path, `contains invalid module syntax: ${message}`);
    }
    if (
        sourceFile.referencedFiles.length > 0 ||
        sourceFile.typeReferenceDirectives.length > 0 ||
        sourceFile.libReferenceDirectives.length > 0 ||
        sourceFile.amdDependencies.length > 0 ||
        sourceFile.hasNoDefaultLib
    ) {
        throw invalidVerificationSourceReference(path, "must not use reference, lib, or AMD resolution directives");
    }
    return sourceFile;
}

function scriptKind(compiler: typeof TypeScript, path: string): TypeScript.ScriptKind {
    if (path.endsWith(".tsx")) {
        return compiler.ScriptKind.TSX;
    }
    if (path.endsWith(".jsx")) {
        return compiler.ScriptKind.JSX;
    }
    if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
        return compiler.ScriptKind.JS;
    }
    return compiler.ScriptKind.TS;
}

function isSourceModule(path: string): boolean {
    return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function isDataModule(path: string): boolean {
    return DATA_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

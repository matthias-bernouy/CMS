import type { CanonicalFileSet } from "@bernouy/cms-integration-packages";
import type * as TypeScript from "typescript";
import {
    INTEGRATION_UPGRADE_FIXTURES_SDK_V1_SPECIFIER,
    INTEGRATION_VERIFICATION_SDK_V1_SPECIFIER,
} from "../../interfaces/verification";
import { IntegrationVerificationContractError } from "./errors";

export function collectVerificationModulePaths(
    compiler: typeof TypeScript,
    sourceFile: TypeScript.SourceFile,
    files: CanonicalFileSet,
    path: string,
): readonly string[] {
    return collectModuleSpecifiers(compiler, sourceFile, path).flatMap((specifier) => {
        const resolved = resolveAllowedModule(files, path, specifier);
        return resolved === null ? [] : [resolved];
    });
}

export function invalidVerificationSourceReference(
    path: string,
    message: string,
): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError(
        "invalid_reference",
        `verification source ${JSON.stringify(path)} ${message}`,
        `files.${path}`,
    );
}

function collectModuleSpecifiers(
    compiler: typeof TypeScript,
    sourceFile: TypeScript.SourceFile,
    path: string,
): readonly string[] {
    const specifiers: string[] = [];
    const add = (value: TypeScript.Expression | undefined, construct: string): void => {
        if (!value || !compiler.isStringLiteralLike(value)) {
            throw invalidVerificationSourceReference(
                path,
                `${construct} must use one exact string-literal module path`,
            );
        }
        specifiers.push(value.text);
    };
    const visit = (node: TypeScript.Node): void => {
        if (compiler.isImportDeclaration(node)) {
            add(node.moduleSpecifier, "import");
        } else if (compiler.isExportDeclaration(node) && node.moduleSpecifier) {
            add(node.moduleSpecifier, "export");
        } else if (compiler.isImportTypeNode(node)) {
            add(compiler.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, "import type");
        } else if (
            compiler.isImportEqualsDeclaration(node) &&
            compiler.isExternalModuleReference(node.moduleReference)
        ) {
            add(node.moduleReference.expression, "import equals");
        } else if (compiler.isCallExpression(node) && node.expression.kind === compiler.SyntaxKind.ImportKeyword) {
            if (node.arguments.length !== 1) {
                throw invalidVerificationSourceReference(path, "dynamic import must use one exact local argument");
            }
            add(node.arguments[0], "dynamic import");
        } else if (
            compiler.isCallExpression(node) &&
            compiler.isIdentifier(node.expression) &&
            node.expression.text === "require"
        ) {
            if (node.arguments.length !== 1) {
                throw invalidVerificationSourceReference(path, "require must use one exact local argument");
            }
            add(node.arguments[0], "require");
        } else if (isImportMeta(compiler, node)) {
            throw invalidVerificationSourceReference(path, "must not use import.meta module or filesystem resolution");
        } else if (compiler.isIdentifier(node) && node.text === "require" && !isDirectRequireCall(compiler, node)) {
            throw invalidVerificationSourceReference(path, "must not alias or indirectly invoke require");
        } else if (isBunResolver(compiler, node)) {
            throw invalidVerificationSourceReference(path, "must not use runtime package resolution");
        }
        compiler.forEachChild(node, visit);
    };
    visit(sourceFile);
    return specifiers;
}

function resolveAllowedModule(files: CanonicalFileSet, importer: string, specifier: string): string | null {
    if (
        specifier === INTEGRATION_VERIFICATION_SDK_V1_SPECIFIER ||
        specifier === INTEGRATION_UPGRADE_FIXTURES_SDK_V1_SPECIFIER
    ) {
        return null;
    }
    if ((!specifier.startsWith("./") && !specifier.startsWith("../")) || /[\\\0?#%]/.test(specifier)) {
        throw invalidVerificationSourceReference(
            importer,
            `imports forbidden non-local module ${JSON.stringify(specifier)}`,
        );
    }
    const resolved = importer.split("/");
    resolved.pop();
    for (const segment of specifier.split("/")) {
        if (segment === ".") {
            continue;
        }
        if (segment === "..") {
            if (resolved.length === 0) {
                throw invalidVerificationSourceReference(
                    importer,
                    `imports path outside the verification bundle: ${JSON.stringify(specifier)}`,
                );
            }
            resolved.pop();
            continue;
        }
        if (segment.length === 0) {
            throw invalidVerificationSourceReference(
                importer,
                `imports non-canonical path ${JSON.stringify(specifier)}`,
            );
        }
        resolved.push(segment);
    }
    const path = resolved.join("/");
    if (!Object.hasOwn(files, path)) {
        throw invalidVerificationSourceReference(importer, `imports missing exact bundle file ${JSON.stringify(path)}`);
    }
    return path;
}

function isDirectRequireCall(compiler: typeof TypeScript, node: TypeScript.Identifier): boolean {
    return compiler.isCallExpression(node.parent) && node.parent.expression === node;
}

function isBunResolver(compiler: typeof TypeScript, node: TypeScript.Node): boolean {
    return (
        compiler.isPropertyAccessExpression(node) &&
        compiler.isIdentifier(node.expression) &&
        node.expression.text === "Bun" &&
        (node.name.text === "resolve" || node.name.text === "resolveSync")
    );
}

function isImportMeta(compiler: typeof TypeScript, node: TypeScript.Node): boolean {
    return (
        compiler.isMetaProperty(node) &&
        node.keywordToken === compiler.SyntaxKind.ImportKeyword &&
        node.name.text === "meta"
    );
}

import type * as TypeScript from "typescript";
import { invalidVerificationSourceReference } from "./suiteImports";

const FORBIDDEN_GLOBALS = new Set([
    "Bun",
    "Deno",
    "EventSource",
    "Function",
    "WebSocket",
    "Worker",
    "XMLHttpRequest",
    "document",
    "eval",
    "fetch",
    "global",
    "globalThis",
    "navigator",
    "process",
    "window",
]);

export function assertVerificationSourceGlobals(
    compiler: typeof TypeScript,
    sourceFile: TypeScript.SourceFile,
    path: string,
): void {
    const visit = (node: TypeScript.Node): void => {
        if (
            compiler.isIdentifier(node) &&
            FORBIDDEN_GLOBALS.has(node.text) &&
            !isNonReferenceIdentifier(compiler, node)
        ) {
            throw invalidVerificationSourceReference(
                path,
                `uses forbidden runtime global ${JSON.stringify(node.text)}`,
            );
        }
        if (isConstructorEscape(compiler, node)) {
            throw invalidVerificationSourceReference(path, "must not access an object constructor as executable code");
        }
        compiler.forEachChild(node, visit);
    };
    visit(sourceFile);
}

function isConstructorEscape(compiler: typeof TypeScript, node: TypeScript.Node): boolean {
    return (
        (compiler.isPropertyAccessExpression(node) && node.name.text === "constructor") ||
        (compiler.isElementAccessExpression(node) &&
            compiler.isStringLiteralLike(node.argumentExpression) &&
            node.argumentExpression.text === "constructor")
    );
}

function isNonReferenceIdentifier(compiler: typeof TypeScript, node: TypeScript.Identifier): boolean {
    const parent = node.parent;
    return (
        (compiler.isPropertyAccessExpression(parent) && parent.name === node) ||
        (compiler.isPropertyAssignment(parent) && parent.name === node) ||
        (compiler.isMethodDeclaration(parent) && parent.name === node) ||
        (compiler.isPropertyDeclaration(parent) && parent.name === node) ||
        (compiler.isBindingElement(parent) && parent.propertyName === node) ||
        (compiler.isImportSpecifier(parent) && parent.propertyName === node) ||
        (compiler.isExportSpecifier(parent) && parent.propertyName === node) ||
        (compiler.isTypeReferenceNode(parent) && parent.typeName === node)
    );
}

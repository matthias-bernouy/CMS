import type * as TypeScript from "typescript";
import { invalidVerificationSourceReference } from "./suiteImports";

const FORBIDDEN_GLOBALS = new Set([
    "Bun",
    "Deno",
    "EventSource",
    "Function",
    "Reflect",
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

const FORBIDDEN_RUNTIME_PROPERTIES = new Set([
    "__proto__",
    "arguments",
    "callee",
    "caller",
    "constructor",
    "getOwnPropertyDescriptor",
    "getOwnPropertyDescriptors",
    "getPrototypeOf",
    "prototype",
    "setPrototypeOf",
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
        if (isRuntimeReflectionEscape(compiler, node)) {
            throw invalidVerificationSourceReference(path, "must not access reflective runtime capabilities");
        }
        if (
            compiler.isElementAccessExpression(node) &&
            !compiler.isStringLiteralLike(node.argumentExpression) &&
            !compiler.isNumericLiteral(node.argumentExpression)
        ) {
            throw invalidVerificationSourceReference(path, "must use an exact literal property access");
        }
        compiler.forEachChild(node, visit);
    };
    visit(sourceFile);
}

function isRuntimeReflectionEscape(compiler: typeof TypeScript, node: TypeScript.Node): boolean {
    if (compiler.isPropertyAccessExpression(node)) {
        return FORBIDDEN_RUNTIME_PROPERTIES.has(node.name.text);
    }
    if (compiler.isElementAccessExpression(node) && compiler.isStringLiteralLike(node.argumentExpression)) {
        return FORBIDDEN_RUNTIME_PROPERTIES.has(node.argumentExpression.text);
    }
    if (compiler.isBindingElement(node)) {
        const property = node.propertyName ?? node.name;
        return compiler.isIdentifier(property) && FORBIDDEN_RUNTIME_PROPERTIES.has(property.text);
    }
    return false;
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

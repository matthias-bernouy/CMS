import * as ts from "typescript";
import type { ArchitectureViolation } from "./architectureTypes";
import { toRelativePath } from "./pathUtils";
import { lineOf } from "./sourceImports";

export function checkEnvironmentReads(
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

function collectEnvironmentReads(sourceFile: ts.SourceFile): Array<{ expression: string; line: number }> {
    const reads: Array<{ expression: string; line: number }> = [];
    const visit = (node: ts.Node): void => {
        collectDestructuredRead(node, sourceFile, reads);
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

function collectDestructuredRead(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    reads: Array<{ expression: string; line: number }>,
): void {
    if (!ts.isVariableDeclaration(node) || !ts.isObjectBindingPattern(node.name) || !node.initializer) return;
    const owner = environmentOwnerName(node.initializer);
    if (!owner) return;
    for (const element of node.name.elements) {
        const property = element.propertyName ?? element.name;
        if (bindingPropertyName(property) !== "env") continue;
        reads.push({ expression: `${owner}.env`, line: lineOf(sourceFile, element) });
    }
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
    if (isPropertyAccessNamed(node, "process") && ts.isIdentifier(node.expression)) {
        return node.expression.text === "globalThis" ? "globalThis.process" : undefined;
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
    return ts.isElementAccessExpression(node)
        && !!node.argumentExpression
        && ts.isStringLiteralLike(node.argumentExpression)
        && node.argumentExpression.text === name;
}

function isAccessOnExpression(parent: ts.Node, expression: ts.Node): boolean {
    return (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent))
        && parent.expression === expression;
}

function compactExpression(expression: string): string {
    return expression.replace(/\s+/g, "");
}

import * as ts from "typescript";
import type { ArchitectureViolation } from "./architectureTypes";
import { toRelativePath } from "./pathUtils";
import { lineOf } from "./sourceImports";

export function checkFocusedTests(
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

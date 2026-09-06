import ts from "typescript";
import { clientExport, globalTarget, HTTP_METHODS, importedTarget, type NetworkTarget } from "./clients";
import type { SourceSymbols } from "./symbols";

export function networkResolver({ checker, written }: SourceSymbols) {
    const resolving = new Set<ts.Symbol>();
    const member = (base: NetworkTarget | undefined, property: string): NetworkTarget | undefined => {
        if (base?.kind === "global") {
            return globalTarget(property);
        }
        if (base?.kind === "namespace") {
            return clientExport(base.name, property);
        }
        if (base?.kind === "client" && HTTP_METHODS.has(property)) {
            return { kind: "method", name: `${base.name}.${property}` };
        }
        if (base && ["fetch", "client", "method"].includes(base.kind) && ["call", "apply"].includes(property)) {
            return base;
        }
        return undefined;
    };
    const resolve = (expression: ts.Expression): NetworkTarget | undefined => {
        if (
            ts.isParenthesizedExpression(expression) ||
            ts.isAsExpression(expression) ||
            ts.isNonNullExpression(expression) ||
            ts.isTypeAssertionExpression(expression) ||
            ts.isSatisfiesExpression(expression)
        ) {
            return resolve(expression.expression);
        }
        if (ts.isPropertyAccessExpression(expression)) {
            return member(resolve(expression.expression), expression.name.text);
        }
        if (
            ts.isElementAccessExpression(expression) &&
            expression.argumentExpression &&
            ts.isStringLiteralLike(expression.argumentExpression)
        ) {
            return member(resolve(expression.expression), expression.argumentExpression.text);
        }
        if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
            const base = resolve(expression.expression.expression);
            const property = expression.expression.name.text;
            if (property === "bind" && base?.kind === "fetch") {
                return base;
            }
            if (base?.kind === "client" && ["create", "extend"].includes(property)) {
                return base;
            }
        }
        if (!ts.isIdentifier(expression)) {
            return undefined;
        }
        const symbol = checker.getSymbolAtLocation(expression);
        if (!symbol || (expression.text === "globalThis" && !symbol.declarations?.length)) {
            return globalTarget(expression.text);
        }
        if (written.has(symbol) || resolving.has(symbol)) {
            return undefined;
        }
        resolving.add(symbol);
        try {
            const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
            if (!declaration) {
                return undefined;
            }
            if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
                return resolve(declaration.initializer);
            }
            if (
                ts.isBindingElement(declaration) &&
                ts.isObjectBindingPattern(declaration.parent) &&
                ts.isVariableDeclaration(declaration.parent.parent)
            ) {
                const initializer = declaration.parent.parent.initializer;
                const property = declaration.propertyName ?? declaration.name;
                if (
                    initializer &&
                    (ts.isIdentifier(property) || ts.isStringLiteralLike(property)) &&
                    !declaration.dotDotDotToken &&
                    !declaration.initializer
                ) {
                    return member(resolve(initializer), property.text);
                }
                return undefined;
            }
            return importedTarget(declaration);
        } finally {
            resolving.delete(symbol);
        }
    };
    return resolve;
}

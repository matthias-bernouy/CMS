import * as ts from "typescript";
import type { SourceImport } from "./architectureTypes";

export function createSourceFile(file: string, source: string): ts.SourceFile {
    const scriptKind = /\.[cm]?tsx$/.test(file) ? ts.ScriptKind.TSX
        : /\.[cm]?jsx$/.test(file) ? ts.ScriptKind.JSX
            : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS
                : ts.ScriptKind.TS;
    return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
}

export function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function collectImports(sourceFile: ts.SourceFile): SourceImport[] {
    const imports: SourceImport[] = [];
    const add = (literal: ts.StringLiteralLike, typeOnly = false): void => {
        imports.push({ specifier: literal.text, line: lineOf(sourceFile, literal), typeOnly });
    };
    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
            add(node.moduleSpecifier, isTypeOnlyImport(node));
        } else if (
            ts.isExportDeclaration(node)
            && node.moduleSpecifier
            && ts.isStringLiteralLike(node.moduleSpecifier)
        ) {
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
        } else if (
            ts.isCallExpression(node)
            && node.arguments.length >= 1
            && ts.isStringLiteralLike(node.arguments[0]!)
        ) {
            if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0]!);
            else if (
                node.arguments.length === 1
                && ts.isIdentifier(node.expression)
                && node.expression.text === "require"
            ) add(node.arguments[0]!);
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

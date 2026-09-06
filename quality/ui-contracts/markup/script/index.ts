import * as ts from "typescript";
import type { UiSource } from "../../contracts/types";
import { markupTags } from "../html";
import type { MarkupTag } from "../types";
import { literalMarkup, type StaticBindings } from "./literals";

const HTML_PROPERTIES = new Set(["innerHTML", "outerHTML", "srcdoc"]);
const CORE_CONSTANTS = new Set(["CMS_BINDING_CORE_TAG", "BINDING_CORE_TAG"]);

export function scriptMarkup(source: UiSource): MarkupTag[] {
    const file = ts.createSourceFile(
        source.path,
        source.content,
        ts.ScriptTarget.Latest,
        true,
        /\.tsx$/.test(source.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const bindings = staticBindings(file);
    const tags: MarkupTag[] = [];
    const collect = (expression: ts.Expression | undefined): void => {
        if (expression) {
            tags.push(...markupTags(literalMarkup(expression, file, bindings)));
        }
    };
    const visit = (node: ts.Node): void => {
        if (ts.isReturnStatement(node)) {
            collect(node.expression);
        } else if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
            collect(node.body);
        } else if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            propertyName(node.left) &&
            HTML_PROPERTIES.has(propertyName(node.left)!)
        ) {
            collect(node.right);
        } else if (
            ts.isNewExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === "Response"
        ) {
            collect(node.arguments?.[0]);
        } else if (ts.isCallExpression(node)) {
            const name = propertyName(node.expression);
            if (name === "createElement" || name === "createElementNS") {
                const argument = node.arguments[name === "createElementNS" ? 1 : 0];
                if (argument) {
                    const literal = literalMarkup(argument, file, bindings);
                    if (literal.content.toLowerCase() === "cms-binding-core") {
                        tags.push({ name: "cms-binding-core", offset: argument.getStart(file), attributes: new Map() });
                    }
                }
            } else if (name === "insertAdjacentHTML") {
                collect(node.arguments[1]);
            } else if (
                name === "parseFromString" ||
                (ts.isIdentifier(node.expression) && node.expression.text === "parseHTML") ||
                node.expression.kind === ts.SyntaxKind.SuperKeyword
            ) {
                collect(node.arguments[0]);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return tags.filter(
        (tag, index) => tags.findIndex((other) => other.offset === tag.offset && other.name === tag.name) === index,
    );
}

function propertyName(node: ts.Node): string | undefined {
    if (ts.isPropertyAccessExpression(node)) {
        return node.name.text;
    }
    if (
        ts.isElementAccessExpression(node) &&
        node.argumentExpression &&
        ts.isStringLiteralLike(node.argumentExpression)
    ) {
        return node.argumentExpression.text;
    }
    return undefined;
}

function staticBindings(file: ts.SourceFile): StaticBindings {
    const bindings: StaticBindings = new Map();
    const add = (name: string, value: ts.Expression | string | null): void => {
        bindings.set(name, bindings.has(name) ? null : value);
    };
    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const imports = node.importClause?.namedBindings;
            const trustedPackage = [
                "@bernouy/cms-content/editor",
                "@bernouy/components",
                "@bernouy/components/binding",
            ].includes(node.moduleSpecifier.text);
            if (trustedPackage && imports && ts.isNamedImports(imports)) {
                for (const entry of imports.elements) {
                    if (CORE_CONSTANTS.has(entry.propertyName?.text ?? entry.name.text)) {
                        add(entry.name.text, "cms-binding-core");
                    }
                }
            }
        } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            const constant =
                ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0;
            add(node.name.text, constant ? (node.initializer ?? null) : null);
        } else if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
            add(node.name.text, null);
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return bindings;
}

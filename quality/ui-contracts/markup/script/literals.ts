import * as ts from "typescript";
import { DYNAMIC_VALUE, type MarkupFragment } from "../types";

export type StaticBindings = Map<string, ts.Expression | string | null>;

export function literalMarkup(
    node: ts.Expression,
    file: ts.SourceFile,
    bindings: StaticBindings,
    seen = new Set<string>(),
): MarkupFragment {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
        return literalMarkup(node.expression, file, bindings, seen);
    }
    if (ts.isStringLiteralLike(node)) {
        return decodeLiteral(file.text, node.getStart(file) + 1, node.end - 1);
    }
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
        const value = bindings.get(node.text);
        if (typeof value === "string") {
            return { content: value, positions: Array(value.length).fill(node.getStart(file)) };
        }
        if (value) {
            return literalMarkup(value, file, bindings, new Set([...seen, node.text]));
        }
    }
    if (ts.isTemplateExpression(node)) {
        const parts = [decodeLiteral(file.text, node.head.getStart(file) + 1, node.head.end - 2)];
        for (const span of node.templateSpans) {
            parts.push(literalMarkup(span.expression, file, bindings, seen));
            parts.push(
                decodeLiteral(
                    file.text,
                    span.literal.getStart(file) + 1,
                    span.literal.end - (ts.isTemplateTail(span.literal) ? 1 : 2),
                ),
            );
        }
        return joinFragments(parts);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        return joinFragments([
            literalMarkup(node.left, file, bindings, seen),
            literalMarkup(node.right, file, bindings, seen),
        ]);
    }
    return { content: DYNAMIC_VALUE, positions: [node.getStart(file)] };
}

function joinFragments(parts: MarkupFragment[]): MarkupFragment {
    return { content: parts.map((part) => part.content).join(""), positions: parts.flatMap((part) => part.positions) };
}

function decodeLiteral(source: string, start: number, end: number): MarkupFragment {
    let content = "";
    const positions: number[] = [];
    const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" };
    for (let index = start; index < end; index++) {
        const offset = index;
        let value = source[index]!;
        if (value === "\\" && index + 1 < end) {
            const escaped = source[++index]!;
            if (escaped === "\n" || escaped === "\r") {
                if (escaped === "\r" && source[index + 1] === "\n") {
                    index++;
                }
                continue;
            }
            const hex = /^(?:x([\da-f]{2})|u([\da-f]{4})|u\{([\da-f]+)\})/i.exec(source.slice(index, end));
            if (hex) {
                const point = parseInt(hex[1] ?? hex[2] ?? hex[3]!, 16);
                value = point <= 0x10ffff ? String.fromCodePoint(point) : DYNAMIC_VALUE;
                index += hex[0].length - 1;
            } else {
                value = escapes[escaped] ?? escaped;
            }
        }
        content += value;
        positions.push(...Array(value.length).fill(offset));
    }
    return { content, positions };
}

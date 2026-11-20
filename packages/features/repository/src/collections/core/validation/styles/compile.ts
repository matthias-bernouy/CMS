import { ident, parse, tokenize, tokenTypes, walk } from "css-tree";
import { compileBlocAnimations } from "./animations";
import { BLOC_DOCUMENT_LIMITS } from "@bernouy/content/page-document";

const FORBIDDEN = /:host\b|::slotted\b|:global\b/u;
const NESTED_BLOC_SELECTOR = /\[cms-bloc\b/u;
const COLLECTION_ASSET_URL =
    /^\{\{\s*cms\.asset\.[a-z][a-z0-9.-]{0,95}\/[a-z][a-z0-9-]{0,95}\.[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*\s*\}\}$/u;

/** Validate authored CSS and close it around one Light DOM Bloc boundary. */
export function compileBlocStyle(id: string, source: string): string {
    const implicitBlockEnd = assertStyleBoundary(id, source);
    let ast: ReturnType<typeof parse>;
    try {
        ast = parse(source, { context: "stylesheet", positions: true });
    } catch (error) {
        throw new Error(`Invalid CSS for Bloc ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (FORBIDDEN.test(source) || NESTED_BLOC_SELECTOR.test(source)) {
        throw new Error(`Bloc ${id} CSS must stay inside its Light DOM boundary`);
    }
    walk(ast, (node) => {
        if (node.type === "Atrule") {
            const name = ident.decode(node.name).toLowerCase();
            if (["import", "namespace", "scope", "property"].includes(name)) {
                throw new Error(`Bloc ${id} CSS cannot declare @${name}`);
            }
        }
        if (node.type === "PseudoClassSelector" && node.name.toLowerCase() === "root") {
            throw new Error(`Bloc ${id} CSS cannot use :root`);
        }
        if (node.type === "AttributeSelector" && node.name.name.toLowerCase() === "part" && node.matcher === "=") {
            throw new Error(`Bloc ${id} CSS must match part tokens with [part~="..."]`);
        }
        if (node.type === "TypeSelector" && ["html", "body", "head"].includes(node.name.toLowerCase())) {
            throw new Error(`Bloc ${id} CSS cannot address document elements`);
        }
        if (node.type === "Url" && !COLLECTION_ASSET_URL.test(node.value)) {
            throw new Error(`Bloc ${id} CSS URLs must use immutable collection assets`);
        }
    });
    const prefix = `@layer ulvia.blocks {\n@scope ([cms-bloc="${id}"]) to (:scope [cms-bloc]) {\n`;
    const suffix = "\n}\n}";
    const maximum = BLOC_DOCUMENT_LIMITS.maxStyleCssLength - prefix.length - suffix.length;
    const { css, hasAnimations } = compileBlocAnimations(id, source, ast, maximum);
    if (implicitBlockEnd && hasAnimations) {
        throw new Error(`Bloc ${id} CSS must have balanced delimiters inside its Light DOM boundary`);
    }
    const compiled = css.trim();
    return compiled ? `${prefix}${compiled}${suffix}` : "";
}

/** Reject scope escapes; retain historical EOF block recovery only for non-animated styles. */
function assertStyleBoundary(id: string, source: string): boolean {
    const expected: number[] = [];
    const {
        Function,
        LeftParenthesis,
        RightParenthesis,
        LeftSquareBracket,
        RightSquareBracket,
        LeftCurlyBracket,
        RightCurlyBracket,
        BadString,
        BadUrl,
        Comment,
        String,
        Url,
    } = tokenTypes;
    const invalid = () => {
        throw new Error(`Bloc ${id} CSS must have balanced delimiters inside its Light DOM boundary`);
    };
    tokenize(source, (type, start, end) => {
        if (type === Function || type === LeftParenthesis) {
            expected.push(RightParenthesis);
        } else if (type === LeftSquareBracket) {
            expected.push(RightSquareBracket);
        } else if (type === LeftCurlyBracket) {
            expected.push(RightCurlyBracket);
        } else if (type === RightParenthesis || type === RightSquareBracket || type === RightCurlyBracket) {
            if (expected.pop() !== type) {
                invalid();
            }
        } else if (type === BadString || type === BadUrl) {
            invalid();
        } else if (type === Comment && source.slice(end - 2, end) !== "*/") {
            invalid();
        } else if (type === String && !/^(["'])(?:\\[\s\S]|[^\\])*\1$/u.test(source.slice(start, end))) {
            invalid();
        } else if (type === Url && source[end - 1] !== ")") {
            invalid();
        }
    });
    if (expected.some((type) => type !== RightCurlyBracket)) {
        invalid();
    }
    return expected.length > 0;
}

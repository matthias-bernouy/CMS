import { marked } from "marked";
import type { Token, Tokens } from "marked";
import { ReleaseValidationError } from "../core/protocol/errors";
import { DOCUMENTATION_LIMITS } from "./manifest";

export function parseDocumentationMarkdown(text: string) {
    if (
        new TextEncoder().encode(text).byteLength > DOCUMENTATION_LIMITS.documentBytes ||
        text.includes("\0") ||
        !text.isWellFormed()
    ) {
        throw new ReleaseValidationError("invalid_contract", "invalid or oversized Markdown document");
    }
    const tokens = marked.lexer(text);
    const headings = tokens.filter((token): token is Tokens.Heading => token.type === "heading" && token.depth === 1);
    if (headings.length !== 1) {
        throw new ReleaseValidationError(
            "invalid_contract",
            "documentation requires exactly one level-one Markdown heading",
        );
    }
    const title = plainText(headings[0]!.tokens ?? []).trim();
    if (!title || title.length > 200 || /[\x00-\x1f\x7f]/u.test(title)) {
        throw new ReleaseValidationError("invalid_contract", "invalid documentation title");
    }
    const sections: { heading: string; content: string }[] = [];
    let heading = title;
    let content = "";
    for (const token of tokens) {
        if (token.type === "heading") {
            if (content.trim()) {
                sections.push({ heading, content });
            }
            heading = plainText(token.tokens ?? [])
                .trim()
                .slice(0, 200)
                .toWellFormed();
            content = token.raw;
        } else {
            content += token.raw;
        }
    }
    if (content.trim()) {
        sections.push({ heading, content });
    }
    const links: string[] = [];
    marked.walkTokens(tokens, (token) => {
        if (token.type === "link" || token.type === "image") {
            links.push(token.href);
        }
    });
    return { title, sections, links };
}

function plainText(tokens: readonly Token[]): string {
    return tokens
        .map((token) =>
            "tokens" in token && Array.isArray(token.tokens)
                ? plainText(token.tokens)
                : "text" in token && typeof token.text === "string"
                  ? token.text
                  : "",
        )
        .join("");
}

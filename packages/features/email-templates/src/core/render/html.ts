import { parseHTML } from "linkedom";
import type { TemplateContent } from "email-templates/schemas/content";
import { invalid } from "email-templates/core/errors";
import { tokens, validUrl } from "./tokens";

const allowed = new Set([
    "p",
    "br",
    "h1",
    "h2",
    "h3",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "hr",
    "span",
    "div",
]);
/** Parse in an inert DOM; reject unsupported source instead of silently sanitizing it. */
export function validateHtml(content: TemplateContent): string | undefined {
    if (!content.html) {
        return;
    }
    const { document } = parseHTML(`<html><body>${content.html}</body></html>`);
    const body = document.body;
    if (
        document.head.childNodes.length ||
        document.querySelectorAll("html,body").length !== 2 ||
        document.documentElement.attributes.length ||
        body.attributes.length ||
        [...document.documentElement.childNodes].some((node) => node !== body && node !== document.head)
    ) {
        invalid();
    }
    let count = 0;
    function visit(node: Node, depth: number): void {
        if (++count > 2048 || depth > 24) {
            invalid();
        }
        if (node.nodeType === 3) {
            tokens(node.textContent ?? "");
            return;
        }
        if (node.nodeType !== 1) {
            invalid();
        }
        const element = node as Element;
        if (!allowed.has(element.localName)) {
            invalid();
        }
        for (const attribute of [...element.attributes]) {
            if (element.localName !== "a" || attribute.name !== "href") {
                invalid();
            }
            const names = tokens(attribute.value);
            if (names.length) {
                if (
                    names.length !== 1 ||
                    attribute.value !== `{{${names[0]}}}` ||
                    content.variables.find((variable) => variable.name === names[0])?.kind !== "url" ||
                    !content.variables.find((variable) => variable.name === names[0])?.required
                ) {
                    invalid();
                }
            } else if (!validUrl(attribute.value)) {
                invalid();
            }
        }
        for (const child of [...element.childNodes]) {
            visit(child, depth + 1);
        }
    }
    for (const child of [...body.childNodes]) {
        visit(child, 0);
    }
    // Reject tokens in tag names, attribute names, or parsed-away source positions.
    const parsed = tokens(body.innerHTML).sort();
    const original = tokens(content.html).sort();
    if (JSON.stringify(parsed) !== JSON.stringify(original)) {
        invalid();
    }
    return body.innerHTML;
}
export function hasActionLink(html: string, variable: string): boolean {
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    return [...document.querySelectorAll("a")].some((anchor) => anchor.getAttribute("href") === `{{${variable}}}`);
}

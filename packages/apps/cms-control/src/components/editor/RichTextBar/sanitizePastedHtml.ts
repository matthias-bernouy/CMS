/**
 * Sanitizes HTML coming from the clipboard before it is inserted into a
 * contenteditable text bloc. The goal is to keep *only* the formatting the
 * editor itself can produce (see `commands.ts`) so pasted content stays
 * consistent with the editor's own output — and to drop everything else
 * (div wrappers, Word/Docs chrome, scripts, media, interactive widgets).
 *
 * This is a UX/cleanliness step, not the security boundary: stored content is
 * additionally hardened server-side by `hardenStoredHtml` on save.
 *
 * Decisions (kept inline with the RichTextBar capabilities):
 *  - keep inline formatting: b, i, u, s, a (href only), span (font-size/color)
 *  - keep the block structures the editor recognises: p, h1-h6, blockquote,
 *    ul, ol, li, br — with `text-align` preserved on blocks
 *  - map foreign-but-equivalent tags: strong→b, em→i, strike/del→s, ins→u
 *  - unwrap anything else (div, font, table, …) keeping its text content
 *  - drop tags whose content isn't prose: script/style/img/svg/iframe/forms/…
 */
import { isSafeLinkUrl } from "./commands";

/** Tags kept verbatim. Mirror of what the RichTextBar emits. */
const KEEP_TAGS = new Set([
    "p", "br", "span",
    "b", "i", "u", "s", "a",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "ul", "ol", "li",
]);

/** Foreign tags rewritten to their editor-native equivalent before keeping. */
const RENAME_TAGS: Record<string, string> = {
    strong: "b",
    em: "i",
    strike: "s",
    del: "s",
    ins: "u",
};

/** Tags removed entirely, content included (no meaningful prose inside). */
const DROP_TAGS = new Set([
    "script", "style", "noscript", "template", "head", "title", "meta", "link", "base",
    "iframe", "object", "embed", "img", "svg", "math", "canvas", "picture",
    "video", "audio", "source", "track",
    "form", "input", "button", "select", "option", "optgroup", "textarea", "fieldset", "legend",
]);

/** Tags that carry `text-align` from the editor's block-alignment command. */
const BLOCK_TAGS = new Set([
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li",
]);

const ALIGN_VALUES = new Set(["left", "right", "center", "justify", "start", "end"]);

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** Cleans a raw clipboard HTML string into editor-safe markup. */
export function sanitizePastedHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const container = document.createElement("div");
    for (const node of cleanChildren(doc.body)) container.appendChild(node);
    return container.innerHTML;
}

function cleanChildren(parent: Node): Node[] {
    const out: Node[] = [];
    for (const child of Array.from(parent.childNodes)) out.push(...cleanNode(child));
    return out;
}

function cleanNode(node: Node): Node[] {
    if (node.nodeType === TEXT_NODE) return [document.createTextNode(node.nodeValue ?? "")];
    if (node.nodeType !== ELEMENT_NODE) return []; // comments, processing instructions, …

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) return [];

    const children = cleanChildren(el);
    const mapped = RENAME_TAGS[tag] ?? tag;
    if (!KEEP_TAGS.has(mapped)) return children; // unwrap: promote children, drop the wrapper

    const out = document.createElement(mapped);
    copyAllowedAttributes(el, out, mapped);

    // A <span>/<a> that carries no allowed attribute is just chrome (Word emits
    // armies of style-less spans) — promote its children instead of keeping it.
    if ((mapped === "span" || mapped === "a") && out.attributes.length === 0) return children;

    for (const child of children) out.appendChild(child);
    return [out];
}

function copyAllowedAttributes(src: HTMLElement, dst: HTMLElement, tag: string): void {
    if (tag === "a") {
        const href = src.getAttribute("href");
        if (href && isSafeLinkUrl(href)) dst.setAttribute("href", href);
        return;
    }
    if (tag === "span") {
        copyStyle(src, dst, ["font-size", "color"]);
        return;
    }
    if (BLOCK_TAGS.has(tag)) {
        const align = src.style.getPropertyValue("text-align").trim().toLowerCase();
        if (ALIGN_VALUES.has(align)) dst.style.setProperty("text-align", align);
    }
    // b, i, u, s, br: no attributes kept.
}

function copyStyle(src: HTMLElement, dst: HTMLElement, props: string[]): void {
    for (const prop of props) {
        const value = src.style.getPropertyValue(prop).trim();
        if (value && isSafeCssValue(value)) dst.style.setProperty(prop, value);
    }
}

/** font-size/color never legitimately contain these — block obvious abuse. */
function isSafeCssValue(value: string): boolean {
    const lower = value.toLowerCase();
    return (
        !lower.includes("url(") &&
        !lower.includes("expression(") &&
        !lower.includes("javascript:") &&
        !lower.includes("</")
    );
}

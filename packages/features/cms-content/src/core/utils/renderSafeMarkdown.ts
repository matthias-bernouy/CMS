import MarkdownIt from "markdown-it";
import { parseHTML } from "linkedom";
import { sanitizeDomTree } from "cms-content/core/utils/sanitizeDomTree";

const markdown = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
});

const SAFE_LINK_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
const SAFE_RESOURCE_SCHEMES = new Set(["http", "https"]);
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Render untrusted Markdown into a sanitized HTML fragment.
 *
 * Raw HTML is disabled at the Markdown parser boundary. The generated fragment
 * is then parsed as a DOM and passed through the same sanitizer used for stored
 * CMS markup. A final URL policy keeps navigation links to web, email, phone,
 * fragment, or relative destinations and keeps embedded resources to web or
 * relative destinations. In particular, no `data:` URL survives this helper.
 */
export function renderSafeMarkdown(source: string): string {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = markdown.render(source);
    sanitizeDomTree(document.body);
    hardenLinks(document.body);
    hardenResources(document.body);
    return document.body.innerHTML;
}

function hardenLinks(root: HTMLElement): void {
    for (const link of Array.from(root.querySelectorAll("a"))) {
        const href = link.getAttribute("href");
        if (!href || !hasSafeScheme(href, SAFE_LINK_SCHEMES)) {
            link.removeAttribute("href");
            link.removeAttribute("rel");
            continue;
        }
        if (isExternalWebUrl(href)) {
            link.setAttribute("rel", "noopener noreferrer");
        }
    }
}

function hardenResources(root: HTMLElement): void {
    for (const resource of Array.from(root.querySelectorAll("img"))) {
        const src = resource.getAttribute("src");
        if (src && !hasSafeScheme(src, SAFE_RESOURCE_SCHEMES)) {
            resource.removeAttribute("src");
        }
    }
}

function hasSafeScheme(value: string, allowed: ReadonlySet<string>): boolean {
    const normalized = normalizeUrlForSchemeCheck(value);
    if (normalized.startsWith("//")) {
        return allowed.has("http") || allowed.has("https");
    }
    const match = SCHEME.exec(normalized);
    return !match || allowed.has(match[1]!.toLowerCase());
}

function isExternalWebUrl(value: string): boolean {
    const normalized = normalizeUrlForSchemeCheck(value);
    return normalized.startsWith("//") || /^https?:/i.test(normalized);
}

function normalizeUrlForSchemeCheck(value: string): string {
    return value.trim().replace(/[\u0000-\u0020]/g, "");
}

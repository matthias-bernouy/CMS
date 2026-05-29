import { parseHTML } from "linkedom";
import { sanitizeDomTree } from "@bernouy/cms-shared";

/**
 * Server-side hardening for stored rich-text/page HTML, applied at write time so
 * the admin editing surface (which loads raw stored content) can't be turned into
 * a self-XSS vector, and as defense-in-depth behind the Delivery render sink.
 *
 * Parses with the same engine and the same `innerHTML` assignment Delivery uses,
 * then runs the shared DOM sanitizer — a real parser, so attribute boundaries and
 * HTML entities are resolved before inspection (no string/regex bypass). See
 * `sanitizeDomTree` for exactly what is stripped.
 */
export function hardenStoredHtml(html: string): string {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = html;
    sanitizeDomTree(document.body);
    return document.body.innerHTML;
}

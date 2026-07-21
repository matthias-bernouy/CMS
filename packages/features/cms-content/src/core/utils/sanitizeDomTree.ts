/**
 * DOM-based HTML hardening. Operates on an ALREADY-PARSED element tree, so it is
 * agnostic to the DOM implementation (linkedom in Delivery, happy-dom/browser in
 * the admin) and — crucially — works at the same trust boundary the browser does:
 * a real parser resolves attribute boundaries and decodes entities BEFORE we
 * inspect anything. That sidesteps every class of string/regex bypass:
 *   - `<img src=x/onerror=…>` surfaces `onerror` as a real attribute regardless
 *     of the `/` separator,
 *   - `href="javascript&colon;…"` arrives decoded as `javascript:…`,
 *   - text content (`<p>the onclick handler…</p>`) is never touched.
 *
 * It strips, in place: `<script>`/`<noscript>` elements, all `on*` event-handler
 * attributes (DOMPurify convention), `srcdoc`, and `javascript:`/`vbscript:`/
 * `data:text/html` URLs in navigational attributes. Allow-list-by-removal: the
 * markup/structure is preserved, only the script-bearing bits are removed.
 */

interface SanitizableElement {
    readonly tagName: string;
    getAttributeNames(): string[];
    getAttribute(name: string): string | null;
    removeAttribute(name: string): void;
    remove(): void;
    querySelectorAll(selectors: string): ArrayLike<SanitizableElement>;
}

const DANGEROUS_TAGS = new Set(["SCRIPT", "NOSCRIPT"]);
const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction", "background", "poster"]);

export function sanitizeDomTree(root: SanitizableElement): void {
    for (const el of Array.from(root.querySelectorAll("*"))) {
        if (DANGEROUS_TAGS.has((el.tagName || "").toUpperCase())) {
            el.remove();
            continue;
        }
        for (const name of el.getAttributeNames()) {
            const lower = name.toLowerCase();
            // Event handlers (onclick, onerror, onload, …) and iframe srcdoc are
            // removed outright; no allow-listed attribute starts with `on`.
            if (lower.startsWith("on") || lower === "srcdoc") {
                el.removeAttribute(name);
                continue;
            }
            if (URL_ATTRS.has(lower)) {
                const value = el.getAttribute(name);
                if (value && isDangerousUrl(value)) {
                    el.removeAttribute(name);
                }
            }
        }
    }
}

function isDangerousUrl(value: string): boolean {
    // Whitespace/control chars are ignored by browsers when resolving a scheme
    // (`java\tscript:` → `javascript:`); strip them before testing.
    const v = value.replace(/[\u0000-\u0020]/g, "").toLowerCase();
    return v.startsWith("javascript:") || v.startsWith("vbscript:") || v.startsWith("data:text/html");
}

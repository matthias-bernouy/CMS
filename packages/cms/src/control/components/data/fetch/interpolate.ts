import { resolve } from './pathHelpers';

/**
 * Walks text nodes and attributes under `node`, substituting `{{path}}`
 * occurrences against `context`. Skips <template> elements — their content
 * is processed separately by their parent's iteration in render.ts.
 * `<inner-html>{{path}}</inner-html>` is treated specially: the resolved
 * value is inserted as raw HTML (not escaped) via innerHTML.
 */
export function interpolateNode(node: Node, context: unknown): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const original = node.textContent ?? '';
        const replaced = interpolateString(original, context);
        if (replaced !== original) node.textContent = replaced;
        return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.tagName === 'TEMPLATE') return;
        if (el.tagName === 'INNER-HTML' && tryRawHtmlInject(el, context)) return;
        for (const attr of Array.from(el.attributes)) {
            const replaced = interpolateString(attr.value, context);
            if (replaced !== attr.value) el.setAttribute(attr.name, replaced);
        }
        // `<cms-fetch>` is a rendering boundary: its own attributes (like
        // `url`) are interpolated above, but its children (the inner
        // <template>) belong to a separate stamping pass against ITS data,
        // not the outer parent's context — don't recurse.
        if (el.tagName === 'CMS-FETCH') return;
    }
    for (const child of Array.from(node.childNodes)) {
        interpolateNode(child, context);
    }
}

/** Returns true (consumes the node) if the element holds a single
 *  `{{path}}` placeholder; injects the unescaped value and unwraps
 *  the `<inner-html>` element so it leaves no trace in the output. */
function tryRawHtmlInject(el: Element, context: unknown): boolean {
    const text = el.textContent?.trim() ?? '';
    const m = text.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (!m) return false;
    el.innerHTML = String(resolve(context, m[1]!) ?? '');
    el.replaceWith(...Array.from(el.childNodes));
    return true;
}

/**
 * Substitute `{{path}}` tokens in `str`. Special-case: `{{value}}` refers
 * to the current context itself when the context is a primitive — useful
 * for arrays-of-primitives templates.
 *
 * Returns the resolved value as a plain string. NO HTML entity-encoding:
 *  - For text nodes, `textContent =` accepts arbitrary strings without
 *    HTML parsing, so `<script>` shows as literal text — safe by default.
 *  - For attribute values, `setAttribute` stores the string verbatim;
 *    HTML entity decoding only happens during HTML PARSING (not via JS),
 *    so pre-encoding `"` to `&quot;` would corrupt JSON / URL values
 *    (the consumer sees the literal `&quot;` from `getAttribute`).
 *  - The only XSS vector — raw HTML insertion — is handled separately
 *    via the `<inner-html>` element which intentionally bypasses this.
 */
export function interpolateString(str: string, context: unknown): string {
    return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
        if (path === 'value') {
            if (context !== null && typeof context === 'object' && 'value' in context) {
                return stringify((context as Record<string, unknown>).value);
            }
            return stringify(context);
        }
        return stringify(resolve(context, path));
    });
}

function stringify(value: unknown): string {
    return String(value ?? '');
}

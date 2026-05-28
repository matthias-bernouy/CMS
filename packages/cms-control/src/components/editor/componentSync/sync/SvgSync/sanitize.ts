/**
 * Whitelist of SVG elements safe to inline in the editor / public site.
 * Everything outside this list is stripped — `<script>`, `<foreignObject>`,
 * SMIL `<animate*>` (broad attack surface, rarely used), `<a>` (rendered
 * as a clickable link inside otherwise-decorative content), media tags.
 */
const ALLOWED_TAGS = new Set([
    "svg", "g", "defs", "symbol", "use", "title", "desc",
    "path", "circle", "rect", "line", "polyline", "polygon", "ellipse",
    "clippath", "mask", "marker",
    "lineargradient", "radialgradient", "stop", "pattern",
    "text", "tspan",
    "filter",
    "feblend", "fecolormatrix", "fecomponenttransfer", "fecomposite",
    "feconvolvematrix", "fediffuselighting", "fedisplacementmap",
    "fedistantlight", "feflood", "fefunca", "fefuncb", "fefuncg",
    "fefuncr", "fegaussianblur", "feimage", "femerge", "femergenode",
    "femorphology", "feoffset", "fepointlight", "fespecularlighting",
    "fespotlight", "fetile", "feturbulence",
]);

/**
 * Sanitize a raw SVG string before inlining it into the bloc shadow. Drops
 * disallowed tags, strips every `on*` attribute and any `href` / `xlink:href`
 * that could resolve to a script context. Returns serialized markup ready to
 * inject. Throws when the input doesn't parse as `<svg>` so the caller can
 * surface a clear error to the user.
 */
export function sanitizeSvg(raw: string): string {
    const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    if (doc.querySelector("parsererror")) {
        throw new Error("Invalid SVG: failed to parse.");
    }
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") {
        throw new Error(`Expected <svg> root element, got <${root?.tagName ?? "null"}>.`);
    }
    walk(root);
    return new XMLSerializer().serializeToString(root);
}

function walk(el: Element): void {
    if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
        el.remove();
        return;
    }
    for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
            el.removeAttribute(attr.name);
            continue;
        }
        if (name === "href" || name === "xlink:href") {
            const v = attr.value.trim().toLowerCase();
            const safe =
                v.startsWith("#") ||
                v.startsWith("/") ||
                v.startsWith("./") ||
                v.startsWith("../") ||
                v.startsWith("http:") ||
                v.startsWith("https:");
            if (!safe) el.removeAttribute(attr.name);
        }
    }
    for (const child of Array.from(el.children)) walk(child);
}

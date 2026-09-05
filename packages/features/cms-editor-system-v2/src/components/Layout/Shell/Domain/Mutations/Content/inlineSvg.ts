import { sanitizeSvgTree } from "@bernouy/cms-content/editor";

const ALLOWED_INLINE_SVG_TAGS = new Set([
    "circle",
    "clippath",
    "defs",
    "desc",
    "ellipse",
    "feblend",
    "fecolormatrix",
    "fecomponenttransfer",
    "fecomposite",
    "feconvolvematrix",
    "fediffuselighting",
    "fedisplacementmap",
    "fedistantlight",
    "feflood",
    "fefunca",
    "fefuncb",
    "fefuncg",
    "fefuncr",
    "fegaussianblur",
    "feimage",
    "femerge",
    "femergenode",
    "femorphology",
    "feoffset",
    "fepointlight",
    "fespecularlighting",
    "fespotlight",
    "fetile",
    "feturbulence",
    "filter",
    "g",
    "line",
    "lineargradient",
    "marker",
    "mask",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialgradient",
    "rect",
    "stop",
    "svg",
    "symbol",
    "text",
    "title",
    "tspan",
    "use",
]);

export function parseInlineSvg(document: Document, source: string): HTMLElement | null {
    const Parser = document.defaultView?.DOMParser;
    if (!Parser) {
        return null;
    }

    const parsed = new Parser().parseFromString(source, "image/svg+xml");
    if (parsed.querySelector("parsererror")) {
        return null;
    }

    const root = parsed.documentElement;
    if (root.localName.toLowerCase() !== "svg") {
        return null;
    }

    sanitizeSvgTree(root);
    removeUnsupportedElements(root);
    normalizeAccessibility(root);

    const imported = document.importNode(root, true);
    return imported as unknown as HTMLElement;
}

function normalizeAccessibility(root: Element): void {
    const label = root.getAttribute("aria-label")?.trim() || root.querySelector("title")?.textContent?.trim() || "";
    if (label) {
        root.setAttribute("role", "img");
        root.setAttribute("aria-label", label);
        root.removeAttribute("aria-hidden");
        return;
    }
    root.removeAttribute("role");
    root.removeAttribute("aria-label");
    root.setAttribute("aria-hidden", "true");
}

function removeUnsupportedElements(root: Element): void {
    for (const element of Array.from(root.querySelectorAll("*"))) {
        if (!ALLOWED_INLINE_SVG_TAGS.has(element.localName.toLowerCase())) {
            element.remove();
        }
    }
}

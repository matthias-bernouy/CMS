interface SanitizableElement {
    readonly tagName: string;
    getAttributeNames(): string[];
    getAttribute(name: string): string | null;
    removeAttribute(name: string): void;
    remove(): void;
    querySelectorAll(selectors: string): ArrayLike<SanitizableElement>;
}

const DANGEROUS_SVG_TAGS = new Set([
    "ANIMATE",
    "ANIMATECOLOR",
    "ANIMATEMOTION",
    "ANIMATETRANSFORM",
    "DISCARD",
    "FOREIGNOBJECT",
    "SCRIPT",
    "SET",
]);

const SVG_URL_ATTRS = new Set(["href", "xlink:href"]);

export function sanitizeSvgTree(root: SanitizableElement): void {
    const elements = [
        ...((root.tagName || "").toUpperCase() === "SVG" ? [root] : []),
        ...Array.from(root.querySelectorAll("svg, svg *")),
    ];
    for (const el of elements) {
        if (DANGEROUS_SVG_TAGS.has((el.tagName || "").toUpperCase())) {
            el.remove();
            continue;
        }
        for (const name of el.getAttributeNames()) {
            const lower = name.toLowerCase();
            if (lower.startsWith("on")) {
                el.removeAttribute(name);
                continue;
            }
            if (SVG_URL_ATTRS.has(lower)) {
                const value = el.getAttribute(name);
                if (value && !isSafeSvgUrl(value)) el.removeAttribute(name);
            }
        }
    }
}

function isSafeSvgUrl(value: string): boolean {
    const v = value.replace(/[\u0000-\u0020]/g, "").toLowerCase();
    return (
        v.startsWith("#") ||
        (v.startsWith("/") && !v.startsWith("//")) ||
        v.startsWith("./") ||
        v.startsWith("../") ||
        v.startsWith("data:image/") ||
        v.startsWith("http:") ||
        v.startsWith("https:")
    );
}

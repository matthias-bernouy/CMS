type IconName = keyof typeof ICONS;

const SVG_MAX_LENGTH = 8_000;
const ALLOWED_TAGS = new Set([
    "svg",
    "g",
    "path",
    "circle",
    "rect",
    "line",
    "polyline",
    "polygon",
    "ellipse",
]);
const ALLOWED_ATTRS = new Set([
    "aria-hidden",
    "class",
    "clip-rule",
    "cx",
    "cy",
    "d",
    "fill",
    "fill-rule",
    "focusable",
    "height",
    "points",
    "r",
    "role",
    "rx",
    "ry",
    "stroke",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-width",
    "viewbox",
    "width",
    "x",
    "x1",
    "x2",
    "y",
    "y1",
    "y2",
]);

export function appendIconSlot(host: HTMLElement, svg: string | undefined, icon: string | undefined, fallback: IconName): void {
    const element = createIcon(svg, icon, fallback);
    if (!element) return;
    element.setAttribute("slot", "icon");
    host.append(element);
}

export function renderIcon(target: HTMLElement, svg: string | undefined, icon: string | undefined, fallback: IconName): void {
    target.replaceChildren();
    const element = createIcon(svg, icon, fallback);
    if (element) target.append(element);
}

function createIcon(svg: string | undefined, icon: string | undefined, fallback: IconName): SVGElement | null {
    const iconName = toIconName(icon);
    const source = sanitizeSvg(svg) ?? (iconName ? ICONS[iconName] : undefined) ?? ICONS[fallback];
    const template = document.createElement("template");
    template.innerHTML = source.trim();
    const element = template.content.firstElementChild;
    if (!element || element.tagName.toLowerCase() !== "svg") return null;
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("focusable", "false");
    return element as SVGElement;
}

function sanitizeSvg(value: string | undefined): string | null {
    if (!value || value.length > SVG_MAX_LENGTH) return null;
    const doc = new DOMParser().parseFromString(value, "image/svg+xml");
    if (doc.querySelector("parsererror")) return null;
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== "svg") return null;

    for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
        const tag = element.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) return null;
        for (const attr of Array.from(element.attributes)) {
            const name = attr.name.toLowerCase();
            const attrValue = attr.value.toLowerCase();
            if (
                name.startsWith("on") ||
                name.includes(":") ||
                attrValue.includes("url(") ||
                attrValue.includes("javascript:") ||
                !ALLOWED_ATTRS.has(name)
            ) {
                element.removeAttribute(attr.name);
            }
        }
    }

    return new XMLSerializer().serializeToString(root);
}

function toIconName(value: string | undefined): IconName | undefined {
    return value && value in ICONS ? value as IconName : undefined;
}

const ICONS = {
    database: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="7" ry="3" />
            <path d="M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5" />
            <path d="M5 11v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" />
        </svg>
    `,
    "map-pin": `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 4.99-5.54 10.19-7.4 11.79a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
        </svg>
    `,
    layout: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
        </svg>
    `,
    search: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </svg>
    `,
} as const;

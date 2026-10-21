import { DOMParser } from "linkedom";

const MAX_BYTES = 64 * 1024;
const MAX_ELEMENTS = 256;
const MAX_DEPTH = 16;
const MAX_PATH_LENGTH = 8_192;
const ELEMENTS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
const PRESENTATION = new Set([
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "fill-rule",
    "clip-rule",
    "opacity",
    "vector-effect",
]);
const GEOMETRY = new Map<string, ReadonlySet<string>>([
    ["path", new Set(["d"])],
    ["circle", new Set(["cx", "cy", "r"])],
    ["ellipse", new Set(["cx", "cy", "rx", "ry"])],
    ["rect", new Set(["x", "y", "width", "height", "rx", "ry"])],
    ["line", new Set(["x1", "y1", "x2", "y2"])],
    ["polyline", new Set(["points"])],
    ["polygon", new Set(["points"])],
]);
const NUMBER = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[-+]?\\d+)?";
const NUMBER_VALUE = new RegExp(`^${NUMBER}$`, "iu");
const NUMBER_LIST = new RegExp(`^${NUMBER}(?:[ ,]+${NUMBER})*$`, "iu");
const PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/u;

export type InlineSvgAsset = Readonly<{
    viewBox: string;
    presentation: Readonly<Record<string, string>>;
    markup: string;
    byteLength: number;
    elementCount: number;
}>;

type SvgElement = {
    readonly localName: string;
    readonly childNodes: ArrayLike<{ readonly nodeType: number; readonly textContent: string | null }>;
    readonly innerHTML: string;
    getAttribute(name: string): string | null;
    getAttributeNames(): string[];
};

/** Parse the intentionally small, URL-free SVG profile that may become Page DOM. */
export function parseInlineSvgAsset(input: string | Uint8Array): InlineSvgAsset {
    const source = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input);
    const byteLength = new TextEncoder().encode(source).byteLength;
    if (byteLength > MAX_BYTES || /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|&[A-Za-z#]/iu.test(source)) {
        throw new TypeError("Inline SVG contains forbidden XML features or exceeds its byte budget");
    }
    const document = new DOMParser().parseFromString(source, "image/svg+xml");
    const root = document.documentElement;
    if (!root || root.localName.toLowerCase() !== "svg") {
        throw new TypeError("Inline SVG requires one svg root");
    }
    const viewBox = root.getAttribute("viewBox");
    if (!viewBox || !validViewBox(viewBox)) {
        throw new TypeError("Inline SVG requires a positive four-number viewBox");
    }
    let count = 0;
    visit(root as unknown as SvgElement, 0, () => {
        count += 1;
        if (count > MAX_ELEMENTS) {
            throw new TypeError("Inline SVG exceeds its element budget");
        }
    });
    const presentation = Object.fromEntries(
        root
            .getAttributeNames()
            .map((name) => name.toLowerCase())
            .filter((name) => PRESENTATION.has(name))
            .map((name) => [name, root.getAttribute(name) ?? ""]),
    );
    return Object.freeze({
        viewBox,
        presentation: Object.freeze(presentation),
        markup: root.innerHTML,
        byteLength,
        elementCount: count,
    });
}

function visit(element: SvgElement, depth: number, increment: () => void): void {
    if (depth > MAX_DEPTH) {
        throw new TypeError("Inline SVG exceeds its depth budget");
    }
    increment();
    const tag = element.localName.toLowerCase();
    if (!ELEMENTS.has(tag)) {
        throw new TypeError(`Inline SVG element is forbidden: ${tag}`);
    }
    validateAttributes(element, tag);
    for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === 3 && !node.textContent?.trim()) {
            continue;
        }
        if (node.nodeType !== 1) {
            throw new TypeError("Inline SVG accepts only geometry elements");
        }
        visit(node as unknown as SvgElement, depth + 1, increment);
    }
}

function validateAttributes(element: SvgElement, tag: string): void {
    for (const name of element.getAttributeNames()) {
        const normalized = name.toLowerCase();
        const value = element.getAttribute(name) ?? "";
        if (tag === "svg" && normalized === "viewbox") {
            continue;
        }
        if (tag === "svg" && normalized === "xmlns" && value === "http://www.w3.org/2000/svg") {
            continue;
        }
        if (PRESENTATION.has(normalized)) {
            validatePresentation(normalized, value);
            continue;
        }
        if (!GEOMETRY.get(tag)?.has(normalized)) {
            throw new TypeError(`Inline SVG attribute is forbidden: ${tag}.${name}`);
        }
        validateGeometry(normalized, value);
    }
}

function validatePresentation(name: string, value: string): void {
    if ((name === "fill" || name === "stroke") && (value === "none" || value === "currentColor")) {
        return;
    }
    if ((name === "fill-rule" || name === "clip-rule") && (value === "nonzero" || value === "evenodd")) {
        return;
    }
    if (name === "stroke-linecap" && ["butt", "round", "square"].includes(value)) {
        return;
    }
    if (name === "stroke-linejoin" && ["miter", "round", "bevel"].includes(value)) {
        return;
    }
    if (name === "vector-effect" && value === "non-scaling-stroke") {
        return;
    }
    if (["stroke-width", "stroke-miterlimit", "opacity"].includes(name) && NUMBER_VALUE.test(value)) {
        const number = Number(value);
        if (Number.isFinite(number) && number >= 0 && (name !== "opacity" || number <= 1)) {
            return;
        }
    }
    throw new TypeError(`Inline SVG presentation value is forbidden: ${name}`);
}

function validateGeometry(name: string, value: string): void {
    if (name === "d") {
        if (!value || value.length > MAX_PATH_LENGTH || !PATH_DATA.test(value)) {
            throw new TypeError("Inline SVG path data is invalid or too complex");
        }
        return;
    }
    if (name === "points") {
        if (!value || value.length > MAX_PATH_LENGTH || !NUMBER_LIST.test(value)) {
            throw new TypeError("Inline SVG points are invalid or too complex");
        }
        return;
    }
    if (!NUMBER_VALUE.test(value) || !Number.isFinite(Number(value))) {
        throw new TypeError(`Inline SVG geometry value is invalid: ${name}`);
    }
}

function validViewBox(value: string): boolean {
    if (!NUMBER_LIST.test(value)) {
        return false;
    }
    const numbers = value.trim().split(/[ ,]+/u).map(Number);
    return numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2]! > 0 && numbers[3]! > 0;
}

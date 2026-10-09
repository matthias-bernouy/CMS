import { MANAGED_NATIVE_ELEMENT_TAGS } from "cms-content/blocs/core/markup/validation/contracts/managedNativePolicy";

const NATIVE_HTML_TAGS = new Set([
    "a",
    "abbr",
    "address",
    "area",
    "article",
    "aside",
    "audio",
    "b",
    "base",
    "bdi",
    "bdo",
    "blockquote",
    "body",
    "br",
    "button",
    "canvas",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "data",
    "datalist",
    "dd",
    "del",
    "details",
    "dfn",
    "dialog",
    "div",
    "dl",
    "dt",
    "em",
    "embed",
    "fieldset",
    "figcaption",
    "label",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "head",
    "header",
    "hgroup",
    "hr",
    "html",
    "i",
    "iframe",
    "img",
    "input",
    "ins",
    "kbd",
    "label",
    "legend",
    "li",
    "link",
    "main",
    "map",
    "mark",
    "math",
    "menu",
    "meta",
    "meter",
    "nav",
    "noscript",
    "object",
    "ol",
    "optgroup",
    "option",
    "output",
    "p",
    "picture",
    "pre",
    "progress",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "script",
    "search",
    "section",
    "select",
    "slot",
    "small",
    "source",
    "span",
    "strong",
    "style",
    "sub",
    "summary",
    "sup",
    "svg",
    "table",
    "tbody",
    "td",
    "template",
    "textarea",
    "tfoot",
    "th",
    "thead",
    "time",
    "title",
    "tr",
    "track",
    "u",
    "ul",
    "var",
    "video",
    "wbr",
]);

export const PLATFORM_NATIVE_ADDABLE_TAGS = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "a",
    "button",
    "form",
    "img",
    "svg",
    "section",
    "ul",
    "ol",
] as const;

export const PLATFORM_NATIVE_CONTEXTUAL_TAGS = ["span", "li"] as const;
export const PLATFORM_NATIVE_SEMANTIC_TAGS = ["article", "nav", "header", "footer", "main", "aside"] as const;
export const PLATFORM_NATIVE_RICH_TEXT_TAGS = [
    "abbr",
    "b",
    "blockquote",
    "br",
    "cite",
    "code",
    "div",
    "em",
    "figcaption",
    "pre",
    "small",
    "strong",
] as const;

/**
 * Native elements that a custom bloc may own as its single, managed Light DOM
 * child. Containers with content-slot semantics are intentionally excluded.
 */
export const PLATFORM_MANAGED_NATIVE_ELEMENT_TAGS = MANAGED_NATIVE_ELEMENT_TAGS;

export type PlatformManagedNativeElementTag = (typeof PLATFORM_MANAGED_NATIVE_ELEMENT_TAGS)[number];

const PLATFORM_AUTHORABLE_NATIVE_TAG_SET = new Set<string>([
    ...PLATFORM_NATIVE_ADDABLE_TAGS,
    ...PLATFORM_NATIVE_CONTEXTUAL_TAGS,
]);
const PLATFORM_NATIVE_CONTENT_TAG_SET = new Set<string>([
    ...PLATFORM_NATIVE_ADDABLE_TAGS,
    ...PLATFORM_NATIVE_CONTEXTUAL_TAGS,
    ...PLATFORM_NATIVE_SEMANTIC_TAGS,
    ...PLATFORM_NATIVE_RICH_TEXT_TAGS,
    ...MANAGED_NATIVE_ELEMENT_TAGS,
    "option",
    "optgroup",
    "source",
    "track",
]);
const PLATFORM_MANAGED_NATIVE_ELEMENT_TAG_SET = new Set<string>(PLATFORM_MANAGED_NATIVE_ELEMENT_TAGS);
const SITE_BLOC_NATIVE_STRUCTURE_TAG_SET = new Set<string>([
    ...PLATFORM_NATIVE_ADDABLE_TAGS,
    ...PLATFORM_NATIVE_CONTEXTUAL_TAGS,
    ...PLATFORM_NATIVE_SEMANTIC_TAGS,
    "strong",
    "em",
    "code",
]);

const PLATFORM_NATIVE_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
    a: new Set(["href", "target", "rel", "aria-current", "aria-label", "data-cms-page-ref", "data-cms-page-suffix"]),
    article: new Set(["aria-label"]),
    aside: new Set(["aria-label"]),
    button: new Set(["type", "disabled", "name", "value", "aria-label"]),
    footer: new Set(["aria-label"]),
    form: new Set(["autocomplete", "data-cms-success-page-ref"]),
    header: new Set(["aria-label"]),
    input: new Set([
        "type",
        "name",
        "value",
        "checked",
        "disabled",
        "required",
        "readonly",
        "autocomplete",
        "placeholder",
        "min",
        "max",
        "step",
        "multiple",
        "accept",
        "inputmode",
        "role",
        "aria-label",
    ]),
    label: new Set(["for"]),
    img: new Set(["src", "alt", "role", "aria-hidden", "loading", "fetchpriority", "width", "height", "decoding"]),
    main: new Set(["aria-label"]),
    nav: new Set(["aria-label"]),
    option: new Set(["value", "selected", "disabled"]),
    optgroup: new Set(["label", "disabled"]),
    output: new Set(["name", "for", "aria-live", "aria-label"]),
    section: new Set(["aria-label"]),
    select: new Set(["name", "multiple", "size", "required", "disabled", "aria-label"]),
    source: new Set(["src", "srcset", "sizes", "media", "type"]),
    svg: new Set(["role", "aria-hidden", "aria-label"]),
    textarea: new Set([
        "name",
        "rows",
        "required",
        "readonly",
        "disabled",
        "autocomplete",
        "placeholder",
        "maxlength",
        "aria-label",
    ]),
    track: new Set(["src", "kind", "srclang", "label", "default"]),
};

export function isNativeHtmlTag(tag: string): boolean {
    return NATIVE_HTML_TAGS.has(tag.toLowerCase());
}

export function isPlatformAuthorableNativeTag(tag: string): boolean {
    return PLATFORM_AUTHORABLE_NATIVE_TAG_SET.has(tag.toLowerCase());
}

export function isPlatformNativeContentTag(tag: string): boolean {
    return PLATFORM_NATIVE_CONTENT_TAG_SET.has(tag.toLowerCase());
}

export function isPlatformManagedNativeElementTag(tag: string): tag is PlatformManagedNativeElementTag {
    return PLATFORM_MANAGED_NATIVE_ELEMENT_TAG_SET.has(tag.toLowerCase());
}

export function isSiteBlocNativeStructureTag(tag: string): boolean {
    return SITE_BLOC_NATIVE_STRUCTURE_TAG_SET.has(tag.toLowerCase());
}

export function isPlatformNativeAttributeAllowed(tag: string, attribute: string): boolean {
    const normalizedAttribute = attribute.toLowerCase();
    return (
        normalizedAttribute === "slot" ||
        PLATFORM_NATIVE_ATTRIBUTES[tag.toLowerCase()]?.has(normalizedAttribute) === true
    );
}

export const isSiteBlocNativeAttributeAllowed = isPlatformNativeAttributeAllowed;

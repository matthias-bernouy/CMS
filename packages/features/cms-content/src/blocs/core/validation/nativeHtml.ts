import { MANAGED_NATIVE_ELEMENT_TAGS } from "cms-content/blocs/core/markup/validation/contracts/managedNativePolicy";
import {
    isDeclaredPlatformNativeAttributeAllowed,
    nativeAttributeBindingKind,
} from "cms-content/blocs/core/markup/validation/contracts/nativeAttributes";

export { nativeAttributeBindingKind };

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
    "details",
    "fieldset",
    "legend",
    "label",
    "option",
    "optgroup",
    "source",
    "track",
    "summary",
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
        normalizedAttribute === "id" ||
        normalizedAttribute === "slot" ||
        isDeclaredPlatformNativeAttributeAllowed(tag, normalizedAttribute)
    );
}

export const isSiteBlocNativeAttributeAllowed = isPlatformNativeAttributeAllowed;

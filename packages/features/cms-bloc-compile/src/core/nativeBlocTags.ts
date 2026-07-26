const NATIVE_BLOC_TAGS = new Set([
    "a",
    "article",
    "aside",
    "blockquote",
    "button",
    "code",
    "datalist",
    "em",
    "fieldset",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "img",
    "input",
    "label",
    "legend",
    "li",
    "meter",
    "nav",
    "ol",
    "optgroup",
    "option",
    "output",
    "p",
    "pre",
    "progress",
    "section",
    "select",
    "small",
    "span",
    "strong",
    "textarea",
    "ul",
]);

export function isNativeBlocTag(tag: string): boolean {
    return NATIVE_BLOC_TAGS.has(tag);
}

export function validateNativeBlocTag(tag: string): string | null {
    if (isNativeBlocTag(tag)) {
        return null;
    }
    return `Invalid native tag "${tag}" — must be one of: ${[...NATIVE_BLOC_TAGS].join(", ")}.`;
}

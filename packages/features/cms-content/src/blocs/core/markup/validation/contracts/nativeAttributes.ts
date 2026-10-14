const PLATFORM_NATIVE_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
    a: new Set(["href", "target", "rel", "aria-current", "aria-label", "data-cms-page-ref", "data-cms-page-suffix"]),
    article: new Set(["aria-label"]),
    aside: new Set(["aria-label"]),
    button: new Set(["type", "disabled", "name", "value", "aria-label", "aria-expanded"]),
    footer: new Set(["aria-label"]),
    form: new Set(["autocomplete", "data-cms-success-page-ref", "data-cms-page-suffix"]),
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
        "maxlength",
        "min",
        "max",
        "step",
        "multiple",
        "accept",
        "inputmode",
        "role",
        "aria-label",
        "aria-expanded",
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

const NATIVE_BOOLEAN_ATTRIBUTES = new Set([
    "checked",
    "default",
    "disabled",
    "hidden",
    "inert",
    "multiple",
    "readonly",
    "required",
    "selected",
]);

type NativeAttributeBindingKind = "boolean" | "string";

export function nativeAttributeBindingKind(attribute: string): NativeAttributeBindingKind {
    return NATIVE_BOOLEAN_ATTRIBUTES.has(attribute.toLowerCase()) ? "boolean" : "string";
}

export function isDeclaredPlatformNativeAttributeAllowed(tag: string, attribute: string): boolean {
    return PLATFORM_NATIVE_ATTRIBUTES[tag.toLowerCase()]?.has(attribute.toLowerCase()) === true;
}

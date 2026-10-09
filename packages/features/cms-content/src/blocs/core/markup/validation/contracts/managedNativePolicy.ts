import type { ManagedNativeElement, ManagedNativeElementTag } from "cms-content/pages/interfaces/document";

export const MANAGED_NATIVE_ELEMENT_TAGS = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "a",
    "button",
    "input",
    "textarea",
    "select",
    "output",
    "img",
    "svg",
    "span",
] as const satisfies readonly ManagedNativeElementTag[];

const NATIVE_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
    a: new Set(["href", "target", "rel", "aria-current", "aria-label", "data-cms-page-ref", "data-cms-page-suffix"]),
    button: new Set(["type", "disabled", "name", "value", "aria-label"]),
    img: new Set(["src", "alt", "role", "aria-hidden", "loading", "fetchpriority", "width", "height", "decoding"]),
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
    output: new Set(["name", "for", "aria-live", "aria-label"]),
    select: new Set(["name", "multiple", "size", "required", "disabled", "aria-label"]),
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
};

export function managedNativeAttributesIssue(
    contract: ManagedNativeElement,
    attributes: Readonly<Record<string, string>>,
    tag?: string,
    options: { allowUnknown?: boolean } = {},
): string | null {
    if (tag && !options.allowUnknown) {
        const allowed = NATIVE_ATTRIBUTES[tag] ?? new Set<string>();
        for (const name of Object.keys(attributes)) {
            if (!allowed.has(name) && !Object.hasOwn(contract.attributes ?? {}, name)) {
                return `native attribute ${JSON.stringify(name)} is not allowed on <${tag}>`;
            }
        }
    }
    for (const [name, constraint] of Object.entries(contract.attributes ?? {})) {
        const value = attributes[name];
        if (value === undefined) {
            if (constraint.required) {
                return `requires native attribute ${JSON.stringify(name)}`;
            }
            continue;
        }
        if (constraint.values && !constraint.values.includes(value)) {
            return `native attribute ${JSON.stringify(name)} must be one of ${constraint.values
                .map((entry) => JSON.stringify(entry))
                .join(", ")}`;
        }
    }
    return null;
}

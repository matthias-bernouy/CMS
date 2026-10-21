import type { ManagedNativeElement, ManagedNativeElementTag } from "cms-content/pages/interfaces/document";
import { isCmsBindingAttribute } from "cms-content/blocs/core/validation/nativeBindings";
import { isDeclaredPlatformNativeAttributeAllowed } from "cms-content/blocs/core/markup/validation/contracts/nativeAttributes";
import { implementationAccessibilityAttributeIssue } from "cms-content/blocs/core/markup/validation/contracts/accessibilityAttributes";
import { nativeAttributeValueIssue } from "cms-content/blocs/core/validation/nativeAttributeValues";
import { CMS_SVG_ATTRIBUTE, svgReferenceIssue } from "cms-content/blocs/core/markup/security/svgReference";

export const MANAGED_NATIVE_ELEMENT_TAGS = [
    "article",
    "aside",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "div",
    "section",
    "header",
    "footer",
    "main",
    "nav",
    "figure",
    "figcaption",
    "form",
    "fieldset",
    "legend",
    "label",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "a",
    "button",
    "dialog",
    "input",
    "textarea",
    "select",
    "optgroup",
    "option",
    "details",
    "summary",
    "output",
    "img",
    "svg",
    "span",
] as const satisfies readonly ManagedNativeElementTag[];

export function managedNativeAttributesIssue(
    contract: ManagedNativeElement,
    attributes: Readonly<Record<string, string>>,
    tag?: string,
    options: { allowUnknown?: boolean } = {},
): string | null {
    if (tag && !options.allowUnknown) {
        for (const [name, value] of Object.entries(attributes)) {
            if (name === CMS_SVG_ATTRIBUTE) {
                if (tag !== "svg") {
                    return `${CMS_SVG_ATTRIBUTE} is allowed only on native <svg>`;
                }
                const issue = svgReferenceIssue(value);
                if (issue) {
                    return issue;
                }
                continue;
            }
            const accessibilityIssue =
                name === "role"
                    ? implementationAccessibilityAttributeIssue(name, value)
                    : name.startsWith("aria-")
                      ? nativeAttributeValueIssue(tag, name, value)
                      : undefined;
            if (accessibilityIssue !== undefined) {
                if (accessibilityIssue) {
                    return accessibilityIssue;
                }
                continue;
            }
            if (
                name !== "id" &&
                !isDeclaredPlatformNativeAttributeAllowed(tag, name) &&
                !isCmsBindingAttribute(name) &&
                !Object.hasOwn(contract.attributes ?? {}, name)
            ) {
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

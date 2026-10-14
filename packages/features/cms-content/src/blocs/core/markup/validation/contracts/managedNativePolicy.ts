import type { ManagedNativeElement, ManagedNativeElementTag } from "cms-content/pages/interfaces/document";
import { isCmsBindingAttribute } from "cms-content/blocs/core/validation/nativeBindings";
import { isDeclaredPlatformNativeAttributeAllowed } from "cms-content/blocs/core/markup/validation/contracts/nativeAttributes";

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

export function managedNativeAttributesIssue(
    contract: ManagedNativeElement,
    attributes: Readonly<Record<string, string>>,
    tag?: string,
    options: { allowUnknown?: boolean } = {},
): string | null {
    if (tag && !options.allowUnknown) {
        for (const name of Object.keys(attributes)) {
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

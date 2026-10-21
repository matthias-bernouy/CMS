import {
    isCmsBindingAttribute,
    nativeBindingAttributeIssue,
    nativeBindingElementIssue,
    nativeFormBindingIssue,
} from "cms-content/blocs/core/validation/nativeBindings";
import {
    nativeAttributeSetIssue,
    nativeAttributeValueIssue,
} from "cms-content/blocs/core/validation/nativeAttributeValues";
import { isPlatformNativeAttributeAllowed } from "cms-content/blocs/core/validation/nativeHtml";
import { accessibleSvgIssue, componentImageIssue } from "cms-content/blocs/core/markup/validation/nativeMediaPolicy";
import {
    implementationAccessibilityAttributeIssue,
    isSupportedAriaAttribute,
} from "cms-content/blocs/core/markup/validation/contracts/accessibilityAttributes";
import { boundAttributeValueIssue } from "cms-content/blocs/core/markup/validation/contracts/attributeBindings";
import { CMS_SVG_ATTRIBUTE, svgReferenceIssue } from "cms-content/blocs/core/markup/security/svgReference";

export type NativePolicyElement = {
    readonly localName: string;
    readonly tagName: string;
    readonly children: ArrayLike<NativePolicyElement>;
    readonly childNodes: ArrayLike<{ readonly nodeType: number; readonly textContent: string | null }>;
    readonly textContent: string | null;
    getAttribute(name: string): string | null;
    getAttributeNames(): string[];
};

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const BROWSER_FORM_OVERRIDE_ATTRIBUTES = new Set([
    "formaction",
    "formenctype",
    "formmethod",
    "formnovalidate",
    "formtarget",
]);

export function customElementAttributesIssue(element: NativePolicyElement): string | null {
    const placementIssue = nativeBindingElementIssue(element.localName.toLowerCase(), attributesOf(element));
    if (placementIssue) {
        return placementIssue;
    }
    for (const name of element.getAttributeNames()) {
        const value = element.getAttribute(name) ?? "";
        if (CONTROL_CHARACTER.test(value)) {
            return `attribute "${name}" contains control characters`;
        }
        if (isCmsBindingAttribute(name)) {
            const issue = nativeBindingAttributeIssue(name, value);
            if (issue) {
                return issue;
            }
        }
        if (name.startsWith("cms-") && !isCmsBindingAttribute(name)) {
            return `attribute "${name}" is not a declared CMS binding`;
        }
    }
    return null;
}

export function nativeElementAttributesIssue(
    element: NativePolicyElement,
    componentOwned: boolean,
    requireFormSource: boolean,
    allowIncompleteMedia: boolean,
    allowImplementationAttributes = false,
    allowTextAttributes = false,
): string | null {
    const tag = element.localName.toLowerCase();
    const attributes = attributesOf(element);
    const placementIssue = nativeBindingElementIssue(tag, attributes);
    if (placementIssue) {
        return placementIssue;
    }
    const attributeIssue = nativeAttributesIssue(
        tag,
        attributes,
        allowImplementationAttributes,
        allowTextAttributes,
        allowIncompleteMedia,
        typeof attributes["cms-bloc"] === "string",
    );
    if (attributeIssue) {
        return attributeIssue;
    }
    if (tag === "form" && requireFormSource) {
        const formIssue = nativeFormBindingIssue(attributes);
        if (formIssue) {
            return formIssue;
        }
    }
    if (tag === "img") {
        if (componentOwned || allowIncompleteMedia) {
            return componentImageIssue(attributes, allowIncompleteMedia);
        }
        const imageIssue = nativeAttributeSetIssue(tag, attributes);
        if (imageIssue) {
            return imageIssue;
        }
        return attributes.src || allowIncompleteMedia ? null : "native image source must reference a CMS media item";
    }
    if (tag === "svg") {
        if (element.getAttribute(CMS_SVG_ATTRIBUTE) === null) {
            return `native <svg> requires ${CMS_SVG_ATTRIBUTE}`;
        }
        if (
            Array.from(element.childNodes).some(
                (node) => node.nodeType === 1 || (node.nodeType === 3 && Boolean(node.textContent?.trim())),
            )
        ) {
            return `native <svg> with ${CMS_SVG_ATTRIBUTE} must be empty`;
        }
        return accessibleSvgIssue(attributes);
    }
    if (
        (tag === "a" || tag === "button") &&
        !element.textContent?.trim() &&
        !attributes["aria-label"]?.trim() &&
        !containsTemplateSlot(element)
    ) {
        return `native <${tag}> requires text content or a non-empty aria-label`;
    }
    return null;
}

function containsTemplateSlot(element: NativePolicyElement): boolean {
    return Array.from(element.children).some(
        (child) => child.localName.toLowerCase() === "slot" || containsTemplateSlot(child),
    );
}

function nativeAttributesIssue(
    tag: string,
    attributes: Readonly<Record<string, string>>,
    allowImplementationAttributes: boolean,
    allowTextAttributes: boolean,
    allowIncompleteMedia: boolean,
    blocRoot: boolean,
): string | null {
    const controlled: Record<string, string> = {};
    for (const [name, value] of Object.entries(attributes)) {
        if (blocRoot && name === "cms-bloc") {
            continue;
        }
        if (name !== name.toLowerCase() || CONTROL_CHARACTER.test(value)) {
            return `attribute "${name}" is not safe on native <${tag}>`;
        }
        if (
            name.startsWith("on") ||
            name === "srcdoc" ||
            name === "data-cms-network-inert" ||
            /^data-cms-(?:src|srcset|sizes|media|width|height)$/.test(name) ||
            BROWSER_FORM_OVERRIDE_ATTRIBUTES.has(name) ||
            (tag === "form" && name === "action")
        ) {
            return `attribute "${name}" is forbidden on native <${tag}>`;
        }
        if (isCmsBindingAttribute(name)) {
            const issue = nativeBindingAttributeIssue(name, value);
            if (issue) {
                return issue;
            }
            continue;
        }
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
        if (name.startsWith("cms-")) {
            return `attribute "${name}" is not a declared CMS binding`;
        }
        if (blocRoot && !isPlatformNativeAttributeAllowed(tag, name)) {
            // Declared Bloc settings are checked against the Bloc contract.
            continue;
        }
        if (name === "role") {
            const accessibilityIssue = implementationAccessibilityAttributeIssue(name, value);
            if (accessibilityIssue) {
                return accessibilityIssue;
            }
            controlled[name] = value;
            continue;
        }
        if (name.startsWith("aria-")) {
            controlled[name] = value;
            continue;
        }
        if (allowImplementationAttributes) {
            const dynamicKind = implementationAttributeBindingKind(name);
            if (dynamicKind) {
                const bindingIssue = boundAttributeValueIssue(value, dynamicKind);
                if (bindingIssue !== undefined) {
                    if (bindingIssue) {
                        return bindingIssue;
                    }
                    continue;
                }
            }
            const accessibilityIssue = implementationAccessibilityAttributeIssue(name, value);
            if (accessibilityIssue !== undefined) {
                if (accessibilityIssue) {
                    return accessibilityIssue;
                }
                continue;
            }
            if (isImplementationAttribute(name, value)) {
                continue;
            }
        }
        if (
            allowTextAttributes &&
            ["alt", "aria-label", "placeholder", "title"].includes(name) &&
            !CONTROL_CHARACTER.test(value)
        ) {
            controlled[name] = /(?:\{\{|#\{|@\{)/u.test(value) ? "dynamic text" : value;
            continue;
        }
        if (name.toLowerCase() === "slot") {
            const issue = nativeAttributeValueIssue(tag, name, value);
            if (issue) {
                return issue;
            }
        }
        if (!isPlatformNativeAttributeAllowed(tag, name)) {
            return `attribute "${name}" is not allowed on native <${tag}>`;
        }
        controlled[name] = value;
    }
    if (tag === "img" && allowIncompleteMedia && attributes.src === undefined) {
        for (const [name, value] of Object.entries(controlled)) {
            const issue = nativeAttributeValueIssue(tag, name, value);
            if (issue) {
                return issue;
            }
        }
        return null;
    }
    return nativeAttributeSetIssue(tag, controlled);
}

function implementationAttributeBindingKind(name: string): "boolean" | "string" | null {
    if (name === "hidden") {
        return "boolean";
    }
    if (name === "id" || name === "tabindex" || /^data-(?!cms-)[a-z][a-z0-9-]*$/u.test(name)) {
        return "string";
    }
    return isSupportedAriaAttribute(name) ? "string" : null;
}

function isImplementationAttribute(name: string, value: string): boolean {
    if (CONTROL_CHARACTER.test(value)) {
        return false;
    }
    if (name === "id") {
        return /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(value);
    }
    if (name === "hidden") {
        return value === "";
    }
    if (name === "tabindex") {
        return value === "-1" || value === "0";
    }
    if (name === "class" || name === "part") {
        return (
            value.length > 0 &&
            value.length <= 512 &&
            value.split(/\s+/u).every((token) => /^[a-z][a-z0-9_-]*$/u.test(token))
        );
    }
    return /^data-(?!cms-)[a-z][a-z0-9-]*$/u.test(name);
}

function attributesOf(element: NativePolicyElement): Record<string, string> {
    return Object.fromEntries(element.getAttributeNames().map((name) => [name, element.getAttribute(name) ?? ""]));
}

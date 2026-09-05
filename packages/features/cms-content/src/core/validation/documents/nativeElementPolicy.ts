import {
    isCmsBindingAttribute,
    nativeBindingAttributeIssue,
    nativeFormBindingIssue,
} from "cms-content/core/validation/blocs/nativeBindings";
import {
    nativeAttributeSetIssue,
    nativeAttributeValueIssue,
} from "cms-content/core/validation/blocs/nativeAttributeValues";
import { isPlatformNativeAttributeAllowed } from "cms-content/core/validation/blocs/nativeHtml";
import { accessibleSvgIssue, componentImageIssue } from "cms-content/core/validation/documents/nativeMediaPolicy";

export type NativePolicyElement = {
    readonly localName: string;
    readonly tagName: string;
    readonly children: ArrayLike<NativePolicyElement>;
    readonly childNodes: ArrayLike<{ readonly nodeType: number; readonly textContent: string | null }>;
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
        if (name.toLowerCase() === "cms-ready") {
            return "CMS runtime binding state cannot be persisted";
        }
    }
    return null;
}

export function nativeElementAttributesIssue(
    element: NativePolicyElement,
    componentOwned: boolean,
    requireFormSource: boolean,
    allowIncompleteMedia: boolean,
): string | null {
    const tag = element.localName.toLowerCase();
    const attributes = attributesOf(element);
    const attributeIssue = nativeAttributesIssue(tag, attributes, componentOwned);
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
        if (componentOwned) {
            return componentImageIssue(attributes, allowIncompleteMedia);
        }
        const imageIssue = nativeAttributeSetIssue(tag, attributes);
        if (imageIssue) {
            return imageIssue;
        }
        return attributes.src || allowIncompleteMedia ? null : "native image source must reference a CMS media item";
    }
    return tag === "svg" ? accessibleSvgIssue(attributes) : null;
}

function nativeAttributesIssue(
    tag: string,
    attributes: Readonly<Record<string, string>>,
    componentOwned: boolean,
): string | null {
    const controlled: Record<string, string> = {};
    for (const [name, value] of Object.entries(attributes)) {
        if ((tag !== "svg" && name !== name.toLowerCase()) || CONTROL_CHARACTER.test(value)) {
            return `attribute "${name}" is not safe on native <${tag}>`;
        }
        if (
            name.startsWith("on") ||
            name === "srcdoc" ||
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
        if (name.startsWith("cms-")) {
            return `attribute "${name}" is not a declared CMS binding`;
        }
        if (name.toLowerCase() === "slot") {
            const issue = nativeAttributeValueIssue(tag, name, value);
            if (issue) {
                return issue;
            }
        }
        if (componentOwned) {
            continue;
        }
        if (tag === "svg" && name !== "slot") {
            continue;
        }
        if (!isPlatformNativeAttributeAllowed(tag, name)) {
            return `attribute "${name}" is not allowed on native <${tag}>`;
        }
        controlled[name] = value;
    }
    return componentOwned ? null : nativeAttributeSetIssue(tag, controlled);
}

function attributesOf(element: NativePolicyElement): Record<string, string> {
    return Object.fromEntries(element.getAttributeNames().map((name) => [name, element.getAttribute(name) ?? ""]));
}

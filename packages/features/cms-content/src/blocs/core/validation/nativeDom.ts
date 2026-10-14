import { isValidCustomElementTag } from "cms-content/application/core/validation/predicates";
import {
    customElementAttributesIssue,
    nativeElementAttributesIssue,
    type NativePolicyElement,
} from "cms-content/blocs/core/markup/validation/nativeElementPolicy";
import { isNativeHtmlTag, isPlatformNativeContentTag } from "cms-content/blocs/core/validation/nativeHtml";
import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG, parseCase } from "cms-content/blocs/core/markup/bindings";

type NativePolicyRoot = { readonly children: ArrayLike<NativePolicyElement> };

export type NativeDomPolicyOptions = {
    allowIncompleteMedia?: boolean;
    allowImplementationAttributes?: boolean;
    allowTextAttributes?: boolean;
    allowTemplateSlots?: boolean;
    rootParentTag?: string;
    skipRootPlacement?: boolean;
    requireFormSource?: boolean;
    rootIsComponentChild?: boolean;
};

const RICH_TEXT_PARENTS = /^(?:h[1-6]|p|a|li|span|strong|em|code)$/;

export function nativeDomTreeIssue(root: NativePolicyRoot, options: NativeDomPolicyOptions = {}): string | null {
    for (const element of Array.from(root.children)) {
        const issue = elementIssue(
            element,
            undefined,
            options.rootParentTag,
            options.rootIsComponentChild === true,
            true,
            options,
        );
        if (issue) {
            return issue;
        }
    }
    return null;
}

function elementIssue(
    element: NativePolicyElement,
    parent: NativePolicyElement | undefined,
    parentTag: string | undefined,
    componentOwned: boolean,
    rootElement: boolean,
    options: NativeDomPolicyOptions,
): string | null {
    const tag = element.localName.toLowerCase();
    const bindingStructureIssue = bindingTreeIssue(element, parent);
    if (bindingStructureIssue) {
        return bindingStructureIssue;
    }
    const custom = isValidCustomElementTag(tag);
    if (tag === "slot" && options.allowTemplateSlots) {
        const slotIssue = templateSlotIssue(element);
        if (slotIssue) {
            return slotIssue;
        }
        for (const child of Array.from(element.children)) {
            const issue = elementIssue(child, element, tag, true, false, options);
            if (issue) {
                return `<slot> contains invalid fallback content: ${issue}`;
            }
        }
        return null;
    }
    if ((parentTag === "ul" || parentTag === "ol") && tag !== "li") {
        return `native <${parentTag}> can contain only direct <li> children`;
    }
    if ((tag === "ul" || tag === "ol") && hasDirectAuthoredText(element)) {
        return `native <${tag}> can contain only direct <li> children`;
    }
    if (!custom && !isNativeHtmlTag(tag)) {
        return `unsupported HTML element <${tag}>`;
    }
    if (!custom && !isPlatformNativeContentTag(tag)) {
        return `native <${tag}> is not part of the platform authoring policy`;
    }

    if (custom) {
        const attributeIssue = customElementAttributesIssue(element);
        if (attributeIssue) {
            return attributeIssue;
        }
    }
    if (!custom) {
        const placementIssue =
            componentOwned || (rootElement && options.skipRootPlacement)
                ? null
                : nativePlacementIssue(tag, parentTag, element, rootElement, options.rootIsComponentChild === true);
        if (placementIssue) {
            return placementIssue;
        }
        const attributeIssue = nativeElementAttributesIssue(
            element,
            componentOwned,
            options.requireFormSource !== false,
            options.allowIncompleteMedia === true,
            options.allowImplementationAttributes === true,
            options.allowTextAttributes === true,
        );
        if (attributeIssue) {
            return attributeIssue;
        }
        if (tag === "svg") {
            return null;
        }
    }

    const ownsChildren = componentOwned || (custom && tag !== CMS_BINDING_CORE_TAG);
    for (const child of Array.from(element.children)) {
        const issue = elementIssue(child, element, tag, ownsChildren, false, options);
        if (issue) {
            return `<${tag}> contains invalid content: ${issue}`;
        }
    }
    return null;
}

function bindingTreeIssue(element: NativePolicyElement, parent: NativePolicyElement | undefined): string | null {
    const ownsMatch = element.getAttribute(CMS_BINDING_ATTRIBUTES.match) !== null;
    const isCase = element.getAttribute(CMS_BINDING_ATTRIBUTES.case) !== null;
    if (isCase && (!parent || parent.getAttribute(CMS_BINDING_ATTRIBUTES.match) === null)) {
        return "cms-case must be a direct child of cms-match";
    }
    if (!ownsMatch) {
        return null;
    }
    if (element.children.length === 0) {
        return "cms-match requires at least one cms-case child";
    }
    const cases = new Set<string>();
    for (const child of Array.from(element.children)) {
        if (child.getAttribute(CMS_BINDING_ATTRIBUTES.case) === null) {
            return "cms-match element children must each declare cms-case";
        }
        const value = parseCase(child.getAttribute(CMS_BINDING_ATTRIBUTES.case) ?? "");
        const key = `${typeof value}:${String(value)}`;
        if (cases.has(key)) {
            return `cms-match cannot declare duplicate case ${JSON.stringify(value)}`;
        }
        cases.add(key);
    }
    const authoredText = Array.from(element.childNodes).some(
        (child) => child.nodeType === 3 && Boolean(child.textContent?.trim()),
    );
    return authoredText ? "cms-match cannot contain direct authored text outside cms-case" : null;
}

function templateSlotIssue(element: NativePolicyElement): string | null {
    for (const name of element.getAttributeNames()) {
        if (name !== "name" && name !== "slot") {
            return `attribute "${name}" is not allowed on template <slot>`;
        }
        const value = element.getAttribute(name) ?? "";
        if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) {
            return `template <slot> ${name} must be a lower-case kebab-case identifier`;
        }
    }
    return null;
}

function nativePlacementIssue(
    tag: string,
    parentTag: string | undefined,
    element: NativePolicyElement,
    rootElement: boolean,
    rootIsComponentChild: boolean,
): string | null {
    const directCustomChild = Boolean(
        parentTag && isValidCustomElementTag(parentTag) && (!rootElement || rootIsComponentChild),
    );
    if (element.getAttribute("slot") !== null && (!parentTag || !isValidCustomElementTag(parentTag))) {
        return "native slot target has an invalid direct parent; it must be a direct custom-element child";
    }
    if (tag === "li" && parentTag !== "ul" && parentTag !== "ol" && !directCustomChild) {
        return "native <li> must be a direct child of <ul> or <ol>";
    }
    if (tag === "span" && !directCustomChild) {
        return "native <span> is reserved for an explicit component text slot";
    }
    if (
        ["strong", "em", "code"].includes(tag) &&
        !directCustomChild &&
        (!parentTag || !RICH_TEXT_PARENTS.test(parentTag))
    ) {
        return `native <${tag}> is only allowed inside rich text`;
    }
    return null;
}

function hasDirectAuthoredText(element: NativePolicyElement): boolean {
    return Array.from(element.childNodes).some((child) => child.nodeType === 3 && Boolean(child.textContent?.trim()));
}

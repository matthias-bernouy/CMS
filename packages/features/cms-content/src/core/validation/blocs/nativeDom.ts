import { isValidCustomElementTag } from "cms-content/core/validation/predicates";
import {
    customElementAttributesIssue,
    nativeElementAttributesIssue,
    type NativePolicyElement,
} from "cms-content/core/validation/documents/nativeElementPolicy";
import { isNativeHtmlTag, isPlatformNativeContentTag } from "cms-content/core/validation/blocs/nativeHtml";
import { CMS_BINDING_CORE_TAG } from "cms-content/interfaces/Editor/BindingSyntax";

type NativePolicyRoot = { readonly children: ArrayLike<NativePolicyElement> };

export type NativeDomPolicyOptions = {
    allowIncompleteMedia?: boolean;
    rootParentTag?: string;
    skipRootPlacement?: boolean;
    requireFormSource?: boolean;
};

const RICH_TEXT_PARENTS = /^(?:h[1-6]|p|a|li|span|strong|em|code)$/;

export function nativeDomTreeIssue(root: NativePolicyRoot, options: NativeDomPolicyOptions = {}): string | null {
    for (const element of Array.from(root.children)) {
        const issue = elementIssue(element, options.rootParentTag, false, true, options);
        if (issue) {
            return issue;
        }
    }
    return null;
}

function elementIssue(
    element: NativePolicyElement,
    parentTag: string | undefined,
    componentOwned: boolean,
    rootElement: boolean,
    options: NativeDomPolicyOptions,
): string | null {
    const tag = element.localName.toLowerCase();
    const custom = isValidCustomElementTag(tag);
    if ((parentTag === "ul" || parentTag === "ol") && tag !== "li") {
        return `native <${parentTag}> can contain only direct <li> children`;
    }
    if ((tag === "ul" || tag === "ol") && hasDirectAuthoredText(element)) {
        return `native <${tag}> can contain only direct <li> children`;
    }
    if (!custom && !isNativeHtmlTag(tag)) {
        return `unsupported HTML element <${tag}>`;
    }
    if (!custom && !componentOwned && !isPlatformNativeContentTag(tag)) {
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
                : nativePlacementIssue(tag, parentTag, element, rootElement);
        if (placementIssue) {
            return placementIssue;
        }
        const attributeIssue = nativeElementAttributesIssue(
            element,
            componentOwned,
            options.requireFormSource !== false,
            options.allowIncompleteMedia === true,
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
        const issue = elementIssue(child, tag, ownsChildren, false, options);
        if (issue) {
            return `<${tag}> contains invalid content: ${issue}`;
        }
    }
    return null;
}

function nativePlacementIssue(
    tag: string,
    parentTag: string | undefined,
    element: NativePolicyElement,
    rootElement: boolean,
): string | null {
    const directCustomChild = Boolean(!rootElement && parentTag && isValidCustomElementTag(parentTag));
    if (element.getAttribute("slot") !== null && (!parentTag || !isValidCustomElementTag(parentTag))) {
        return "native slot placement must target a direct custom-element child";
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

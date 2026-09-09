import { ContentValidationError } from "cms-content/core/validation/errors";
import { isValidCustomElementTag } from "cms-content/core/validation/predicates";
import {
    isSiteBlocNativeAttributeAllowed,
    isSiteBlocNativeStructureTag,
} from "cms-content/core/validation/blocs/nativeHtml";
import {
    isCmsBindingAttribute,
    nativeBindingAttributeIssue,
    nativeBindingElementIssue,
    nativeFormBindingIssue,
} from "cms-content/core/validation/blocs/nativeBindings";
import { nativeAttributeSetIssue } from "cms-content/core/validation/blocs/nativeAttributeValues";
import { CMS_BINDING_RUNTIME_ATTRIBUTES } from "cms-content/interfaces/Editor/BindingSyntax";
import type { SiteBlocNode } from "cms-content/interfaces/blocs";

export function validateNativeSiteBlocNode(
    node: Extract<SiteBlocNode, { kind: "bloc" }>,
    field: string,
    parentTag?: string,
): void {
    const directCustomChild = Boolean(parentTag && isValidCustomElementTag(parentTag));
    if (["img", "svg"].includes(node.tag) && node.children.length > 0) {
        throw new ContentValidationError(field, `native <${node.tag}> cannot contain children`);
    }
    if (node.tag === "li" && parentTag !== "ul" && parentTag !== "ol" && !directCustomChild) {
        throw new ContentValidationError(field, "native <li> must be a direct child of <ul> or <ol>");
    }
    if (node.tag === "span" && !directCustomChild) {
        throw new ContentValidationError(field, "native <span> is reserved for an explicit component text slot");
    }
    if (["strong", "em", "code"].includes(node.tag) && !directCustomChild && !parentTagSupportsRichText(parentTag)) {
        throw new ContentValidationError(field, `native <${node.tag}> is only allowed inside rich text`);
    }
    const staticAttributes: Record<string, string> = {};
    for (const [attribute, value] of Object.entries(node.attributes)) {
        if (isCmsBindingAttribute(attribute)) {
            continue;
        }
        if (attribute !== attribute.toLowerCase() || !isSiteBlocNativeAttributeAllowed(node.tag, attribute)) {
            throw new ContentValidationError(field, `attribute "${attribute}" is not allowed on native <${node.tag}>`);
        }
        if (
            attribute === "slot" &&
            (!parentTag || !isValidCustomElementTag(parentTag) || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value))
        ) {
            throw new ContentValidationError(field, "native slot placement must target a named custom-element slot");
        }
        staticAttributes[attribute] = value;
    }
    const valueIssue = nativeAttributeSetIssue(node.tag, staticAttributes);
    if (valueIssue) {
        throw new ContentValidationError(field, valueIssue);
    }
    if (node.tag === "form") {
        const formIssue = nativeFormBindingIssue(node.attributes);
        if (formIssue) {
            throw new ContentValidationError(field, formIssue);
        }
    }
}

export function validateSiteBlocBindingAttributes(node: Extract<SiteBlocNode, { kind: "bloc" }>, field: string): void {
    const elementIssue = nativeBindingElementIssue(node.tag, node.attributes);
    if (elementIssue) {
        throw new ContentValidationError(field, elementIssue);
    }
    for (const [attribute, value] of Object.entries(node.attributes)) {
        const normalized = attribute.toLowerCase();
        if (normalized === CMS_BINDING_RUNTIME_ATTRIBUTES.ready) {
            throw new ContentValidationError(field, "CMS runtime binding state cannot be persisted");
        }
        if (!isCmsBindingAttribute(attribute)) {
            continue;
        }
        if (attribute !== normalized) {
            throw new ContentValidationError(field, `CMS binding attribute "${attribute}" must be lower-case`);
        }
        const issue = nativeBindingAttributeIssue(attribute, value);
        if (issue) {
            throw new ContentValidationError(field, issue);
        }
    }
}

function parentTagSupportsRichText(parentTag: string | undefined): boolean {
    return !!parentTag && /^(?:h[1-6]|p|a|li|span|strong|em|code)$/.test(parentTag);
}

export function isSiteBlocStructureTag(value: string): boolean {
    return (
        typeof value === "string" &&
        (isValidCustomElementTag(value) || (value === value.toLowerCase() && isSiteBlocNativeStructureTag(value)))
    );
}

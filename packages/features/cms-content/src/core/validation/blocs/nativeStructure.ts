import { ContentValidationError } from "cms-content/core/validation/errors";
import { isValidCustomElementTag } from "cms-content/core/validation/predicates";
import {
    isSiteBlocNativeAttributeAllowed,
    isSiteBlocNativeStructureTag,
} from "cms-content/core/validation/blocs/nativeHtml";
import { nativeAttributeSetIssue } from "cms-content/core/validation/blocs/nativeAttributeValues";
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
    for (const [attribute, value] of Object.entries(node.attributes)) {
        if (attribute !== attribute.toLowerCase() || !isSiteBlocNativeAttributeAllowed(node.tag, attribute)) {
            throw new ContentValidationError(field, `attribute "${attribute}" is not allowed on native <${node.tag}>`);
        }
        if (
            attribute === "slot" &&
            (!parentTag || !isValidCustomElementTag(parentTag) || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value))
        ) {
            throw new ContentValidationError(field, "native slot placement must target a named custom-element slot");
        }
    }
    const valueIssue = nativeAttributeSetIssue(node.tag, node.attributes);
    if (valueIssue) {
        throw new ContentValidationError(field, valueIssue);
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

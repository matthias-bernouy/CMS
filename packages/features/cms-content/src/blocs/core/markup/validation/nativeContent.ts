import { parseHTML } from "linkedom";
import { nativeDomTreeIssue } from "cms-content/blocs/core/validation/nativeDom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { hardenStoredHtml } from "cms-content/blocs/core/markup/security/hardenStoredHtml";
import { isValidCustomElementTag } from "cms-content/application/core/validation/predicates";

export function validatePageContentMarkup(value: string): string {
    const normalized = validateNativeMarkup(value, "content");
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = normalized;
    for (const node of Array.from(document.body.childNodes)) {
        if (node.nodeType === 3 && node.textContent?.trim()) {
            throw new ContentValidationError("content", "Page root text must be owned by a Bloc slot");
        }
        if (node.nodeType === 1 && !isValidCustomElementTag((node as Element).localName)) {
            throw new ContentValidationError(
                "content",
                `native <${(node as Element).localName}> cannot be a Page root; add it through a Bloc contract`,
            );
        }
    }
    return normalized;
}

export function validateSiteBlocDefaultContent(value: string, ownerTag?: string): string {
    return validateNativeMarkup(value, "draft.defaultContent", ownerTag);
}

function validateNativeMarkup(value: string, field: string, rootParentTag?: string): string {
    const hardened = hardenStoredHtml(value);
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = hardened;
    const issue = nativeDomTreeIssue(document.body, { rootParentTag });
    if (issue) {
        throw new ContentValidationError(field, issue);
    }
    return document.body.innerHTML;
}

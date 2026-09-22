import { parseHTML } from "linkedom";
import { nativeDomTreeIssue } from "cms-content/blocs/core/validation/nativeDom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { hardenStoredHtml } from "cms-content/editor/core/markup/hardenStoredHtml";

export function validatePageContentMarkup(value: string): string {
    return validateNativeMarkup(value, "content");
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

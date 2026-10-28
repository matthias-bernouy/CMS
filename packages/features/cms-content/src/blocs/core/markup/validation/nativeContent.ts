import { parseHTML } from "linkedom";
import { nativeDomTreeIssue } from "cms-content/blocs/core/validation/nativeDom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { hardenStoredHtml } from "cms-content/blocs/core/markup/security/hardenStoredHtml";
import { storedMarkupSecurityIssue } from "cms-content/blocs/core/markup/security/storedMarkupIssue";
import { parseMutation, parseQuery } from "cms-content/blocs/core/markup/bindings";
import {
    assertBlocOperationBudget,
    assertBlocDomBudget,
    assertBlocMarkupLength,
} from "cms-content/blocs/core/markup/validation/documents/blocBudgets";
import { validateNativeDocumentReferences } from "cms-content/blocs/core/markup/validation/documents/nativeReferences";

export type BlocContentMarkupResult = {
    readonly html: string;
    readonly queries: readonly ContentQuery[];
    readonly mutations: readonly ContentMutation[];
};

export type ContentQuery = {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly name: string;
};

export type ContentMutation = ContentQuery;

export function validatePageContentMarkup(value: string): string {
    const normalized = validateNativeMarkup(value, "content");
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = normalized;
    for (const node of Array.from(document.body.childNodes)) {
        if (node.nodeType === 3 && node.textContent?.trim()) {
            throw new ContentValidationError("content", "Page root text must be owned by a Bloc slot");
        }
        if (node.nodeType === 1 && !(node as Element).hasAttribute("cms-bloc")) {
            throw new ContentValidationError(
                "content",
                `native <${(node as Element).localName}> cannot be a Page root without cms-bloc`,
            );
        }
    }
    return normalized;
}

export function validateSiteBlocDefaultContent(value: string, ownerTag?: string): string {
    const html = validateNativeMarkup(value, "draft.defaultContent", ownerTag, {}, true);
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = html;
    for (const node of Array.from(document.body.childNodes)) {
        if (node.nodeType === 3 && node.textContent?.trim()) {
            throw new ContentValidationError(
                "draft.defaultContent",
                "Site Bloc default text must be owned by a referenced Bloc",
            );
        }
        if (node.nodeType === 1 && !(node as Element).hasAttribute("cms-bloc")) {
            throw new ContentValidationError(
                "draft.defaultContent",
                `native <${(node as Element).localName}> must be a direct referenced Bloc child`,
            );
        }
    }
    return html;
}

/** Canonical fixed/default Bloc-document grammar shared by every Bloc producer. */
export function validateBlocContentMarkup(
    value: string,
    options: { readonly field: string; readonly kind: "default" | "fixed"; readonly ownerTag?: string },
): BlocContentMarkupResult {
    const html = validateNativeMarkup(
        value,
        options.field,
        options.kind === "default" ? options.ownerTag : undefined,
        {
            allowIncompleteMedia: options.kind === "default",
            rootIsComponentChild: options.kind === "default",
            allowTextAttributes: true,
            ...(options.kind === "fixed"
                ? {
                      allowImplementationAttributes: true,
                      allowTemplateSlots: true,
                      rootIsComponentChild: true,
                      skipRootPlacement: true,
                  }
                : {}),
        },
        true,
    );
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = html;
    const queries = extractQueries(document);
    const mutations = extractMutations(document);
    assertBlocOperationBudget(options.field, queries.length + mutations.length);
    return { html, queries, mutations };
}

export function extractQueries(document: Document): readonly ContentQuery[] {
    const bindings = Array.from(document.querySelectorAll("[cms-query]"), (element) =>
        parseQuery(element.getAttribute("cms-query") ?? ""),
    ).filter((query): query is NonNullable<typeof query> => query !== null);
    const names = new Set<string>();
    for (const query of bindings) {
        if (names.has(query.name)) {
            throw new ContentValidationError("content", `CMS query name ${JSON.stringify(query.name)} must be unique`);
        }
        names.add(query.name);
    }
    const queries = bindings.filter((query): query is ContentQuery => "contractId" in query);
    return queries;
}

export function extractMutations(document: Document): readonly ContentMutation[] {
    const bindings = Array.from(document.querySelectorAll("form[cms-mutation]"), (element) =>
        parseMutation(element.getAttribute("cms-mutation") ?? ""),
    ).filter((mutation): mutation is NonNullable<typeof mutation> => mutation !== null);
    return bindings.filter((mutation) => !mutation.contractId.startsWith("edge."));
}

function validateNativeMarkup(
    value: string,
    field: string,
    rootParentTag?: string,
    options: Parameters<typeof nativeDomTreeIssue>[1] = {},
    enforceBlocBudgets = false,
): string {
    if (enforceBlocBudgets) {
        assertBlocMarkupLength(field, value);
    }
    const securityIssue = storedMarkupSecurityIssue(value);
    if (securityIssue) {
        throw new ContentValidationError(field, securityIssue);
    }
    const hardened = hardenStoredHtml(value);
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = hardened;
    if (enforceBlocBudgets) {
        assertBlocDomBudget(field, document.body);
    }
    if (containsComment(document.body)) {
        throw new ContentValidationError(field, "HTML comments are not part of the persisted Page grammar");
    }
    const issue = nativeDomTreeIssue(document.body, { ...options, rootParentTag });
    if (issue) {
        throw new ContentValidationError(field, issue);
    }
    validateNativeDocumentReferences(document, field);
    return document.body.innerHTML;
}

function containsComment(root: Node): boolean {
    for (const child of Array.from(root.childNodes)) {
        if (child.nodeType === 8 || containsComment(child)) {
            return true;
        }
    }
    return false;
}

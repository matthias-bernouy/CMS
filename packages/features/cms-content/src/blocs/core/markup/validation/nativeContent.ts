import { parseHTML } from "linkedom";
import { nativeDomTreeIssue } from "cms-content/blocs/core/validation/nativeDom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { hardenStoredHtml } from "cms-content/blocs/core/markup/security/hardenStoredHtml";
import { isValidCustomElementTag } from "cms-content/application/core/validation/predicates";
import { storedMarkupSecurityIssue } from "cms-content/blocs/core/markup/security/storedMarkupIssue";
import { parseMutation, parseQuery, parseSource } from "cms-content/blocs/core/markup/bindings";
import { parseCmsSourceSuccessReload } from "cms-content/blocs/core/validation/nativeBindings/formValues";
import {
    assertBlocBindingSourceBudget,
    assertBlocDomBudget,
    assertBlocMarkupLength,
} from "cms-content/blocs/core/markup/validation/documents/blocBudgets";

export type BlocContentMarkupResult = {
    readonly html: string;
    readonly queries: readonly ContentQuery[];
    readonly mutations: readonly ContentMutation[];
    readonly sources: readonly { readonly method?: string; readonly url: string }[];
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
    return validateNativeMarkup(value, "draft.defaultContent", ownerTag, {}, true);
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
    const sources = Array.from(document.querySelectorAll("[cms-source]"), (element) => {
        const source = parseSource(element.getAttribute("cms-source") ?? "");
        return source
            ? {
                  url: source.url,
                  ...(element.hasAttribute("cms-source-method")
                      ? { method: element.getAttribute("cms-source-method") ?? "" }
                      : {}),
              }
            : null;
    }).filter((source): source is NonNullable<typeof source> => source !== null);
    assertBlocBindingSourceBudget(options.field, sources.length + queries.length + mutations.length);
    return { html, queries, mutations, sources };
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
    for (const form of Array.from(document.querySelectorAll("form[cms-source-success-reload]"))) {
        const targets = parseCmsSourceSuccessReload(form.getAttribute("cms-source-success-reload"));
        for (const target of targets ?? []) {
            if (!names.has(target)) {
                throw new ContentValidationError(
                    "content",
                    `CMS source success reload references unknown query ${JSON.stringify(target)}`,
                );
            }
        }
    }
    for (const form of Array.from(document.querySelectorAll("form[cms-mutation-invalidates]"))) {
        const targets = parseCmsSourceSuccessReload(form.getAttribute("cms-mutation-invalidates"));
        for (const target of targets ?? []) {
            if (!names.has(target)) {
                throw new ContentValidationError(
                    "content",
                    `CMS mutation invalidation references unknown query ${JSON.stringify(target)}`,
                );
            }
        }
    }
    return queries;
}

export function extractMutations(document: Document): readonly ContentMutation[] {
    const bindings = Array.from(document.querySelectorAll("form[cms-mutation]"), (element) =>
        parseMutation(element.getAttribute("cms-mutation") ?? ""),
    ).filter((mutation): mutation is NonNullable<typeof mutation> => mutation !== null);
    return bindings.filter((mutation) => !mutation.contractId.startsWith("kernel."));
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

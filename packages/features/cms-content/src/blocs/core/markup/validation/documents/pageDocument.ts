import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { isValidCustomElementTag } from "cms-content/application/core/validation/predicates";
import { extractRefs } from "cms-content/blocs/core/markup/contentRefs";
import { parseSource } from "cms-content/blocs/core/markup/bindings";
import { managedNativeElementIssue } from "cms-content/blocs/core/markup/validation/managedNativeElements";
import {
    extractQueries,
    validatePageContentMarkup,
    type ContentQuery,
} from "cms-content/blocs/core/markup/validation/nativeContent";
import { pageBlocHostAttributesIssue } from "cms-content/blocs/core/markup/validation/contracts/hostAttributes";
import { blocHostContractIssue } from "cms-content/blocs/core/markup/validation/contracts/pageSlotContracts";
import type { PageBlocContract } from "cms-content/pages/interfaces/document";
import { parseHTML } from "linkedom";

export type PageDocumentBlocContract = PageBlocContract;

export type UnresolvedPageDocumentBloc = {
    readonly id: string;
};

export type PageDocumentValidationResult = {
    readonly html: string;
    readonly queries: readonly ContentQuery[];
    readonly sources: readonly PageDocumentSource[];
    readonly uses: readonly string[];
};

export type PageDocumentSource = {
    readonly method?: string;
    readonly url: string;
};

/** Canonical Page-document grammar shared by site-authored and contributed Pages. */
export function validatePageDocument(
    html: string,
    blocs: readonly PageDocumentBlocContract[],
    options: {
        readonly unresolvedBlocs?: readonly UnresolvedPageDocumentBloc[];
    } = {},
): PageDocumentValidationResult {
    const preflight = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>").document;
    preflight.body.innerHTML = html;
    validateHosts(
        preflight,
        new Map(blocs.map((bloc) => [bloc.id, bloc])),
        new Map((options.unresolvedBlocs ?? []).map((bloc) => [bloc.id, bloc])),
        true,
    );
    const normalized = validatePageContentMarkup(html);
    const known = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    const unresolved = new Map((options.unresolvedBlocs ?? []).map((bloc) => [bloc.id, bloc]));
    const uses = [...extractRefs(normalized).blocs].sort();
    const missing = uses.filter((tag) => !known.has(tag) && !unresolved.has(tag));
    if (missing.length > 0) {
        throw new ContentValidationError(
            "content",
            `unknown or inactive reference(s): ${missing.map((tag) => `bloc "${tag}"`).join(", ")}`,
        );
    }

    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = normalized;
    const queries = extractQueries(document);
    validateRoots(document, known, new Set(unresolved.keys()));
    validateHosts(document, known, unresolved);
    validateManagedNative(normalized, blocs);

    const sources = Array.from(document.querySelectorAll("[cms-source]"), (element): PageDocumentSource | null => {
        const source = parseSource(element.getAttribute("cms-source") ?? "");
        return source
            ? {
                  url: source.url,
                  ...(element.hasAttribute("cms-source-method")
                      ? { method: element.getAttribute("cms-source-method") ?? "" }
                      : {}),
              }
            : null;
    }).filter((source): source is PageDocumentSource => source !== null);
    return { html: document.body.innerHTML, queries, sources, uses };
}

function validateHosts(
    document: Document,
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    unresolved: ReadonlyMap<string, UnresolvedPageDocumentBloc>,
    allowUnknown = false,
): void {
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
        const tag = element.localName.toLowerCase();
        if (!isValidCustomElementTag(tag) || unresolved.has(tag)) {
            continue;
        }
        const bloc = known.get(tag);
        if (!bloc) {
            if (allowUnknown) {
                continue;
            }
            throw new ContentValidationError("content", `unknown or inactive reference: bloc "${tag}"`);
        }
        const issue = pageBlocHostAttributesIssue(
            Object.fromEntries(element.getAttributeNames().map((name) => [name, element.getAttribute(name) ?? ""])),
            bloc,
            element.parentElement !== document.body,
        );
        if (issue) {
            throw new ContentValidationError("content", issue);
        }
    }
}

function validateManagedNative(html: string, blocs: readonly PageDocumentBlocContract[]): void {
    const issue = managedNativeElementIssue(
        html,
        blocs.flatMap((bloc) => (bloc.nativeElement ? [{ tag: bloc.id, nativeElement: bloc.nativeElement }] : [])),
    );
    if (issue) {
        throw new ContentValidationError("content", issue);
    }
}

function validateRoots(
    document: Document,
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    unresolved: ReadonlySet<string>,
): void {
    for (const node of Array.from(document.body.childNodes)) {
        if (node.nodeType !== 1) {
            continue;
        }
        const root = node as Element;
        if (unresolved.has(root.localName)) {
            continue;
        }
        const bloc = known.get(root.localName);
        if (!bloc) {
            throw new ContentValidationError("content", `unavailable Page root Bloc <${root.localName}>`);
        }
        const issue = blocHostContractIssue(root, bloc, known, unresolved);
        if (issue) {
            throw new ContentValidationError("content", issue);
        }
    }
}

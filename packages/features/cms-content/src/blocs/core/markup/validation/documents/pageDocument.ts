import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { extractRefs } from "cms-content/blocs/core/markup/contentRefs";
import { managedNativeElementIssue } from "cms-content/blocs/core/markup/validation/managedNativeElements";
import {
    extractQueries,
    extractMutations,
    validatePageContentMarkup,
    type ContentQuery,
} from "cms-content/blocs/core/markup/validation/nativeContent";
import { pageBlocHostAttributesIssue } from "cms-content/blocs/core/markup/validation/contracts/hostAttributes";
import { blocHostContractIssue } from "cms-content/blocs/core/markup/validation/contracts/pageSlotContracts";
import type { PageBlocContract } from "cms-content/pages/interfaces/document";
import {
    validateDocumentBindings,
    type BindingAnalysisOptions,
} from "cms-content/blocs/core/markup/validation/bindingAnalysis";
import { parseHTML } from "linkedom";

export type PageDocumentBlocContract = PageBlocContract;

export type UnresolvedPageDocumentBloc = {
    readonly id: string;
};

export type PageDocumentValidationResult = {
    readonly html: string;
    readonly queries: readonly ContentQuery[];
    readonly mutations: readonly ContentQuery[];
    readonly uses: readonly string[];
};

/** Canonical Page-document grammar shared by site-authored and contributed Pages. */
export function validatePageDocument(
    html: string,
    blocs: readonly PageDocumentBlocContract[],
    options: {
        readonly unresolvedBlocs?: readonly UnresolvedPageDocumentBloc[];
    } & BindingAnalysisOptions = {},
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
            `unknown or hidden reference(s): ${missing.map((tag) => `bloc "${tag}"`).join(", ")}`,
        );
    }

    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = normalized;
    const queries = extractQueries(document);
    const mutations = extractMutations(document);
    if (options.capabilities || options.requireCapabilityResolution) {
        validateDocumentBindings(document, options);
    }
    validateRoots(document, known, new Set(unresolved.keys()));
    validateHosts(document, known, unresolved);
    validateManagedNative(normalized, blocs);

    return { html: document.body.innerHTML, queries, mutations, uses };
}

function validateHosts(
    document: Document,
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    unresolved: ReadonlyMap<string, UnresolvedPageDocumentBloc>,
    allowUnknown = false,
): void {
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
        const tag = element.getAttribute("cms-bloc")?.toLowerCase();
        if (!tag || unresolved.has(tag)) {
            continue;
        }
        const bloc = known.get(tag);
        if (!bloc) {
            if (allowUnknown) {
                continue;
            }
            throw new ContentValidationError("content", `unknown or hidden reference: bloc "${tag}"`);
        }
        const issue = pageBlocHostAttributesIssue(
            Object.fromEntries(element.getAttributeNames().map((name) => [name, element.getAttribute(name) ?? ""])),
            bloc,
            element.parentElement !== document.body,
            true,
            false,
            element.localName,
        );
        if (issue) {
            throw new ContentValidationError("content", issue);
        }
    }
}

function validateManagedNative(html: string, blocs: readonly PageDocumentBlocContract[]): void {
    const issue = managedNativeElementIssue(
        html,
        blocs.map((bloc) => ({ id: bloc.id, root: bloc.root, content: bloc.content })),
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
        const id = root.getAttribute("cms-bloc")?.toLowerCase();
        if (id && unresolved.has(id)) {
            continue;
        }
        const bloc = id ? known.get(id) : undefined;
        if (!bloc) {
            throw new ContentValidationError("content", `Page roots must declare an available cms-bloc identity`);
        }
        const issue = blocHostContractIssue(root, bloc, known, unresolved);
        if (issue) {
            throw new ContentValidationError("content", issue);
        }
    }
}

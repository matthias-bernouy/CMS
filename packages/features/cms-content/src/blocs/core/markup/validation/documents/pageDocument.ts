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
        readonly hiddenBlocs?: readonly PageDocumentBlocContract[];
    } & BindingAnalysisOptions = {},
): PageDocumentValidationResult {
    const visible = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    const hidden = new Map((options.hiddenBlocs ?? []).map((bloc) => [bloc.id, bloc]));
    const available = new Map([...visible, ...hidden]);
    const preflight = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>").document;
    preflight.body.innerHTML = html;
    validateHosts(preflight, available, new Map((options.unresolvedBlocs ?? []).map((bloc) => [bloc.id, bloc])), true);
    const normalized = validatePageContentMarkup(html);
    const unresolved = new Map((options.unresolvedBlocs ?? []).map((bloc) => [bloc.id, bloc]));
    const uses = [...extractRefs(normalized).blocs].sort();
    const missing = uses.filter((tag) => !available.has(tag) && !unresolved.has(tag));
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
    validateRoots(document, available, new Set(visible.keys()), new Set(unresolved.keys()));
    validateHiddenNesting(document, hidden, available);
    validateHosts(document, available, unresolved);
    validateManagedNative(normalized, [...blocs, ...(options.hiddenBlocs ?? [])]);

    return { html: document.body.innerHTML, queries, mutations, uses };
}

function validateHiddenNesting(
    document: Document,
    hidden: ReadonlyMap<string, PageDocumentBlocContract>,
    available: ReadonlyMap<string, PageDocumentBlocContract>,
): void {
    for (const element of Array.from(document.body.querySelectorAll("[cms-bloc]"))) {
        const id = element.getAttribute("cms-bloc")?.toLowerCase();
        if (!id || !hidden.has(id)) {
            continue;
        }
        const parent = element.parentElement;
        const parentId = parent?.getAttribute("cms-bloc")?.toLowerCase();
        const parentBloc = parentId ? available.get(parentId) : undefined;
        const slotName = element.getAttribute("slot") ?? "";
        const explicitlyAccepted = parentBloc?.slots?.[slotName]?.accepts?.some(
            (accept) => accept.kind === "component" && accept.tag === id,
        );
        if (!explicitlyAccepted) {
            throw new ContentValidationError(
                "content",
                `hidden Bloc <${id}> must be nested in a slot that explicitly accepts it`,
            );
        }
    }
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
        blocs.map((bloc) => ({ id: bloc.id, root: bloc.root })),
    );
    if (issue) {
        throw new ContentValidationError("content", issue);
    }
}

function validateRoots(
    document: Document,
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    visible: ReadonlySet<string>,
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
        if (!id || !bloc || !visible.has(id)) {
            throw new ContentValidationError(
                "content",
                `Page roots must declare an available cms-bloc identity; unknown or hidden roots are forbidden`,
            );
        }
        const issue = blocHostContractIssue(root, bloc, known, unresolved);
        if (issue) {
            throw new ContentValidationError("content", issue);
        }
    }
}

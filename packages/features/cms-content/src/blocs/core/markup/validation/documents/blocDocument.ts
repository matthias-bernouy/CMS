import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { extractRefs } from "cms-content/blocs/core/markup/contentRefs";
import { pageBlocHostAttributesIssue } from "cms-content/blocs/core/markup/validation/contracts/hostAttributes";
import { blocHostContractIssue } from "cms-content/blocs/core/markup/validation/contracts/pageSlotContracts";
import { managedNativeElementIssue } from "cms-content/blocs/core/markup/validation/managedNativeElements";
import {
    validateBlocContentMarkup,
    type BlocContentMarkupResult,
} from "cms-content/blocs/core/markup/validation/nativeContent";
import type {
    PageDocumentBlocContract,
    UnresolvedPageDocumentBloc,
} from "cms-content/blocs/core/markup/validation/documents/pageDocument";
import { parseHTML } from "linkedom";
import {
    validateDocumentBindings,
    type BindingAnalysisOptions,
} from "cms-content/blocs/core/markup/validation/bindingAnalysis";

export type BlocDocumentContract = PageDocumentBlocContract & {
    readonly defaultContent?: string;
    readonly fixedContent?: string;
};

export type BlocDocumentValidationResult = {
    readonly defaultContent?: string;
    readonly fixedContent?: string;
    readonly queries: BlocContentMarkupResult["queries"];
    readonly mutations: BlocContentMarkupResult["mutations"];
};

/** Canonical published-Bloc document grammar shared by every Bloc producer. */
export function validateBlocDocument(
    bloc: BlocDocumentContract,
    catalogue: readonly PageDocumentBlocContract[],
    unresolvedBlocs: readonly UnresolvedPageDocumentBloc[] = [],
    bindingOptions: BindingAnalysisOptions = {},
): BlocDocumentValidationResult {
    const known = new Map(catalogue.map((entry) => [entry.id, entry]));
    known.set(bloc.id, bloc);
    const unresolved = new Set(unresolvedBlocs.map(({ id }) => id));
    let fixed: BlocContentMarkupResult | undefined;
    let defaultResult: BlocContentMarkupResult | undefined;
    let defaultContent: string | undefined;

    if (bloc.fixedContent !== undefined) {
        fixed = validateBlocContentMarkup(bloc.fixedContent, {
            field: "fixedContent",
            kind: "fixed",
            ownerTag: bloc.id,
        });
        validateFragment(fixed.html, bloc.id, known, unresolved, bloc.kind === "component");
        validateBindings(fixed.html, bindingOptions);
    }
    if (bloc.defaultContent !== undefined) {
        const validated = validateBlocContentMarkup(bloc.defaultContent, {
            field: "defaultContent",
            kind: "default",
            ownerTag: bloc.id,
        });
        defaultResult = validated;
        defaultContent = validated.html;
        validateDefaultContent(bloc, defaultContent, known, unresolved);
        validateBindings(defaultContent, bindingOptions);
    }
    return {
        ...(defaultContent === undefined ? {} : { defaultContent }),
        ...(fixed === undefined ? {} : { fixedContent: fixed.html }),
        queries: [...(fixed?.queries ?? []), ...(defaultResult?.queries ?? [])],
        mutations: [...(fixed?.mutations ?? []), ...(defaultResult?.mutations ?? [])],
    };
}

function validateBindings(html: string, options: BindingAnalysisOptions): void {
    if (!options.capabilities && !options.requireCapabilityResolution) {
        return;
    }
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = html;
    validateDocumentBindings(document, options);
}

function validateFragment(
    html: string,
    ownerTag: string,
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    unresolved: ReadonlySet<string>,
    allowOwnedNative: boolean,
): void {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = html;
    validateReferences(html, document, ownerTag, known, unresolved);
    validateHostAttributes(document, known, unresolved, true, true);
    validateManagedNative(html, known);
    for (const heading of Array.from(document.body.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
        if (!heading.hasAttribute("cms-bloc")) {
            throw new ContentValidationError(
                "fixedContent",
                `fixed Bloc markup cannot own <${heading.localName}>; place an explicit heading Bloc instead`,
            );
        }
    }
    for (const host of Array.from(document.body.querySelectorAll("*"))) {
        const tag = host.getAttribute("cms-bloc")?.toLowerCase();
        const contract = tag ? known.get(tag) : undefined;
        if (!contract) {
            continue;
        }
        const issue = blocHostContractIssue(host, contract, known, unresolved, true, allowOwnedNative);
        if (issue) {
            throw new ContentValidationError("fixedContent", issue);
        }
    }
}

function validateDefaultContent(
    owner: BlocDocumentContract,
    html: string,
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    unresolved: ReadonlySet<string>,
): void {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    const rootTag = owner.root.accepts[0] ?? "div";
    const root = document.createElement(rootTag);
    root.setAttribute("cms-bloc", owner.id);
    for (const [name, value] of Object.entries(owner.root.defaults ?? {})) {
        root.setAttribute(name, value);
    }
    root.innerHTML = html;
    document.body.append(root);
    validateReferences(html, document, owner.id, known, unresolved);
    validateHostAttributes(document, known, unresolved, false);
    validateManagedNative(document.body.innerHTML, known);
    const host = document.body.firstElementChild!;
    const issue = blocHostContractIssue(host, owner, known, unresolved);
    if (issue) {
        throw new ContentValidationError("defaultContent", issue);
    }
}

function validateReferences(
    html: string,
    document: Document,
    ownerTag: string,
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    unresolved: ReadonlySet<string>,
): void {
    for (const tag of extractRefs(html).blocs) {
        if (tag === ownerTag) {
            throw new ContentValidationError("uses", `bloc ${ownerTag} cannot reference itself`);
        }
        if (!known.has(tag) && !unresolved.has(tag)) {
            throw new ContentValidationError("uses", `unknown local bloc ${tag}`);
        }
    }
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
        const tag = element.getAttribute("cms-bloc")?.toLowerCase();
        if (!tag || known.has(tag) || unresolved.has(tag)) {
            continue;
        }
        throw new ContentValidationError("content", `unknown local bloc ${tag}`);
    }
}

function validateHostAttributes(
    document: Document,
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    unresolved: ReadonlySet<string>,
    fragmentOwned: boolean,
    allowDynamicSettings = true,
): void {
    for (const host of Array.from(document.body.querySelectorAll("*"))) {
        const tag = host.getAttribute("cms-bloc")?.toLowerCase();
        if (!tag) {
            continue;
        }
        const contract = known.get(tag);
        if (!contract || unresolved.has(tag)) {
            continue;
        }
        const issue = pageBlocHostAttributesIssue(
            Object.fromEntries(host.getAttributeNames().map((name) => [name, host.getAttribute(name) ?? ""])),
            contract,
            fragmentOwned || host.parentElement !== document.body,
            allowDynamicSettings,
            fragmentOwned,
            host.localName,
        );
        if (issue) {
            throw new ContentValidationError("content", issue);
        }
    }
}

function validateManagedNative(html: string, known: ReadonlyMap<string, PageDocumentBlocContract>): void {
    const issue = managedNativeElementIssue(
        html,
        [...known.values()].map((bloc) => ({ id: bloc.id, root: bloc.root })),
    );
    if (issue) {
        throw new ContentValidationError("content", issue);
    }
}

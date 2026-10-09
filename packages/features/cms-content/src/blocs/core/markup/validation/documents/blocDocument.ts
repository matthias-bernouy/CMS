import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { isValidCustomElementTag } from "cms-content/application/core/validation/predicates";
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

export type BlocDocumentContract = PageDocumentBlocContract & {
    readonly defaultContent?: string;
    readonly fixedContent?: string;
};

export type BlocDocumentValidationResult = {
    readonly defaultContent?: string;
    readonly fixedContent?: string;
    readonly sources: BlocContentMarkupResult["sources"];
};

/** Canonical published-Bloc document grammar shared by every Bloc producer. */
export function validateBlocDocument(
    bloc: BlocDocumentContract,
    catalogue: readonly PageDocumentBlocContract[],
    unresolvedBlocs: readonly UnresolvedPageDocumentBloc[] = [],
): BlocDocumentValidationResult {
    const known = new Map(catalogue.map((entry) => [entry.id, entry]));
    known.set(bloc.id, bloc);
    const unresolved = new Set(unresolvedBlocs.map(({ id }) => id));
    let fixed: BlocContentMarkupResult | undefined;
    let defaultContent: string | undefined;

    if (bloc.fixedContent !== undefined) {
        fixed = validateBlocContentMarkup(bloc.fixedContent, {
            field: "fixedContent",
            kind: "fixed",
            ownerTag: bloc.id,
        });
        validateFragment(fixed.html, known, unresolved, true);
    }
    if (bloc.defaultContent !== undefined) {
        const validated = validateBlocContentMarkup(bloc.defaultContent, {
            field: "defaultContent",
            kind: "default",
            ownerTag: bloc.id,
        });
        defaultContent = validated.html;
        validateDefaultContent(bloc, defaultContent, known, unresolved);
    }
    return {
        ...(defaultContent === undefined ? {} : { defaultContent }),
        ...(fixed === undefined ? {} : { fixedContent: fixed.html }),
        sources: fixed?.sources ?? [],
    };
}

function validateFragment(
    html: string,
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    unresolved: ReadonlySet<string>,
    allowCmsHost: boolean,
): void {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = html;
    validateReferences(html, document, known, unresolved, allowCmsHost);
    validateHostAttributes(document, known, unresolved, true);
    validateManagedNative(html, known);
    for (const host of Array.from(document.body.querySelectorAll("*"))) {
        const contract = known.get(host.localName);
        if (!contract) {
            continue;
        }
        const issue = blocHostContractIssue(host, contract, known, unresolved, true);
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
    document.body.innerHTML = `<${owner.id}>${html}</${owner.id}>`;
    validateReferences(html, document, known, unresolved, false);
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
    known: ReadonlyMap<string, PageDocumentBlocContract>,
    unresolved: ReadonlySet<string>,
    allowCmsHost: boolean,
): void {
    for (const tag of extractRefs(html).blocs) {
        if (!known.has(tag) && !unresolved.has(tag)) {
            throw new ContentValidationError("uses", `unknown local bloc ${tag}`);
        }
    }
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
        const tag = element.localName.toLowerCase();
        if (!isValidCustomElementTag(tag) || known.has(tag) || unresolved.has(tag)) {
            continue;
        }
        if (allowCmsHost && tag === "cms-host") {
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
): void {
    for (const host of Array.from(document.body.querySelectorAll("*"))) {
        const tag = host.localName.toLowerCase();
        const contract = known.get(tag);
        if (!contract || unresolved.has(tag)) {
            continue;
        }
        const issue = pageBlocHostAttributesIssue(
            Object.fromEntries(host.getAttributeNames().map((name) => [name, host.getAttribute(name) ?? ""])),
            contract,
            fragmentOwned || host.parentElement !== document.body,
        );
        if (issue) {
            throw new ContentValidationError("content", issue);
        }
    }
}

function validateManagedNative(html: string, known: ReadonlyMap<string, PageDocumentBlocContract>): void {
    const issue = managedNativeElementIssue(
        html,
        [...known.values()].flatMap((bloc) =>
            bloc.nativeElement ? [{ tag: bloc.id, nativeElement: bloc.nativeElement }] : [],
        ),
    );
    if (issue) {
        throw new ContentValidationError("content", issue);
    }
}

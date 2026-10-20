import { validateBlocDocument, type BlocDocumentValidationResult } from "@bernouy/cms-content/page-document";
import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { isCollectionSystemQuery } from "../../parsing/requirements";
import { validateManagedNativeDefinition } from "./managedNative";
import { validateDeclarative, validateNoBindings } from "./shell";
import { type BlocMarkup, pageSlots, validatePageSlots, validateSlotTargets } from "./slots";
import { elements, markupTree, significantRoots } from "./tree";

function inspect(bloc: CollectionBloc): BlocMarkup {
    const fixed = markupTree(bloc.markup);
    return {
        fixed,
        initial: bloc.defaultContent === undefined ? undefined : markupTree(bloc.defaultContent),
        pageSlots: pageSlots(fixed),
    };
}

function validateDeclaredUses(tree: ReturnType<typeof markupTree>, bloc: CollectionBloc, path: string): void {
    for (const node of elements(tree)) {
        const id = node.attribs["cms-bloc"];
        if (id && !bloc.uses.includes(id)) {
            invalid(`placed Bloc ${id} must be declared in uses`, path);
        }
    }
}

/** Checks authored Bloc markup and the shared Page grammar. */
export function validateMarkup(
    blocs: readonly CollectionBloc[],
    limits: Readonly<CollectionLimits>,
    importedBlocs: ReadonlySet<string> = new Set(),
): void {
    const byId = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    const markup = new Map(blocs.map((bloc) => [bloc.id, inspect(bloc)]));
    for (const bloc of blocs) {
        const path = `$.blocs[${bloc.id}]`;
        const content = markup.get(bloc.id)!;
        validateManagedNativeDefinition(bloc, path);
        validateDeclarative(content.fixed, `${path}.markup`, bloc.kind === "component");
        if (content.initial) {
            validateDeclarative(content.initial, `${path}.defaultContent`);
            validateNoBindings(content.initial, `${path}.defaultContent`);
        }
        let canonical: BlocDocumentValidationResult;
        try {
            canonical = validateBlocDocument(
                { ...bloc, fixedContent: bloc.markup },
                blocs,
                [...importedBlocs].map((id) => ({ id })),
            );
        } catch (error) {
            invalid(error instanceof Error ? error.message : "invalid Bloc document", path);
        }
        if (content.pageSlots.size > limits.maxSlotsPerBloc) {
            invalid(`markup must offer at most ${limits.maxSlotsPerBloc} slots`, `${path}.slots`);
        }
        validatePageSlots(bloc, content, path);
        if (bloc.kind === "component" && significantRoots(content.fixed).some((node) => node.type === "text")) {
            invalid("component markup needs element roots for slot projection", `${path}.markup`);
        }
        validateDeclaredUses(content.fixed, bloc, `${path}.markup`);
        validateSlotTargets(content.fixed, content.pageSlots, byId, markup, `${path}.markup`, importedBlocs);
        validateRequirements(bloc, canonical!, path);
        if (content.initial) {
            validateDeclaredUses(content.initial, bloc, `${path}.defaultContent`);
            validateSlotTargets(
                content.initial,
                content.pageSlots,
                byId,
                markup,
                `${path}.defaultContent`,
                importedBlocs,
            );
        }
    }
}

function validateRequirements(bloc: CollectionBloc, canonical: BlocDocumentValidationResult, path: string): void {
    const calls = [
        ...canonical.queries.map(({ contractId, capabilityId }) =>
            isCollectionSystemQuery(contractId, capabilityId) ? null : `${contractId}/${capabilityId}`,
        ),
        ...canonical.mutations.map(({ contractId, capabilityId }) =>
            contractId.startsWith("kernel.") ? null : `${contractId}/${capabilityId}`,
        ),
    ];
    const requirements = new Set(bloc.requires.map(({ contractId, capabilityId }) => `${contractId}/${capabilityId}`));
    for (const call of calls) {
        if (call !== null && !requirements.has(call)) {
            invalid(`capability call ${call} must be declared in requires`, `${path}.requires`);
        }
    }
}

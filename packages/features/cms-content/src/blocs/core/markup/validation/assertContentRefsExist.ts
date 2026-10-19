import { parseHTML } from "linkedom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { expandCompositions } from "cms-content/blocs/core/composition/expandCompositions";
import { validateStateQueryGraph } from "cms-content/blocs/core/markup/bindings/operation/stateGraph";
import type { TBloc } from "cms-content/blocs/interfaces/blocs";
import type { BlocSettings } from "cms-content/pages/interfaces/document";
import { validatePageDocument } from "cms-content/blocs/core/markup/validation/documents/pageDocument";
import {
    resolveBindingAnalysisOptions,
    type ContentBindingValidationOptions,
} from "cms-content/application/core/validation/bindingCapabilities";

/** Minimal reader — `CmsRepository` satisfies it structurally. */
export type ContentRefsReader = {
    getBlocsList(options?: { includeHidden?: boolean }): Promise<
        Array<{
            id: string;
            compositionHTML?: TBloc["compositionHTML"];
            templateHTML?: TBloc["templateHTML"];
            root: TBloc["root"];
            content?: TBloc["content"];
            slots?: TBloc["slots"];
            settings?: BlocSettings;
        }>
    >;
};

/**
 * Server-side Page grammar gate. Every root is an active Bloc and every child
 * must satisfy the direct parent's managed-native or named-slot contract.
 */
export async function assertContentRefsExist(
    repository: ContentRefsReader,
    content: string,
    bindingOptions: ContentBindingValidationOptions = {},
): Promise<void> {
    if (!content) {
        return;
    }

    const [registeredBlocs, completeCatalogue] = await Promise.all([
        repository.getBlocsList(),
        repository.getBlocsList({ includeHidden: true }),
    ]);
    const visibleIds = new Set(registeredBlocs.map(({ id }) => id));
    const hiddenBlocs = completeCatalogue.filter(({ id }) => !visibleIds.has(id));
    const contracts = (blocs: typeof completeCatalogue) =>
        blocs.map((bloc) => ({
            id: bloc.id,
            kind: bloc.compositionHTML === undefined ? ("component" as const) : ("composition" as const),
            slots: bloc.slots ?? {},
            root: bloc.root,
            ...(bloc.content ? { content: bloc.content } : {}),
            ...(bloc.settings ? { settings: bloc.settings } : {}),
        }));
    const visibleContracts = contracts(registeredBlocs);
    const hiddenContracts = contracts(hiddenBlocs);
    const document = validatePageDocument(content, visibleContracts, { hiddenBlocs: hiddenContracts });
    if (
        bindingOptions.resolveCapabilities ||
        bindingOptions.resolveQueryCapabilities ||
        bindingOptions.requireQueryCapabilityResolution
    ) {
        validatePageDocument(document.html, visibleContracts, {
            hiddenBlocs: hiddenContracts,
            ...(await resolveBindingAnalysisOptions(document.queries, document.mutations, bindingOptions)),
        });
    }
    const { document: expandedDocument } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    expandedDocument.body.innerHTML = document.html;
    try {
        expandCompositions(expandedDocument.body, completeCatalogue);
        validateStateQueryGraph(expandedDocument.body);
    } catch (error) {
        throw new ContentValidationError(
            "content",
            error instanceof Error ? error.message : "invalid automatic state query graph",
        );
    }
}

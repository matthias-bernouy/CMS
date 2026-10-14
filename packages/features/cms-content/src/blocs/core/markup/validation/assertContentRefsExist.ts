import { parseHTML } from "linkedom";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { expandCompositions } from "cms-content/blocs/core/composition/expandCompositions";
import { validateStateQueryGraph } from "cms-content/blocs/core/markup/bindings/source/stateGraph";
import type { TBloc } from "cms-content/blocs/interfaces/blocs";
import type { BlocSettings } from "cms-content/pages/interfaces/document";
import { validatePageDocument } from "cms-content/blocs/core/markup/validation/documents/pageDocument";

/** Minimal reader — `CmsRepository` satisfies it structurally. */
export type ContentRefsReader = {
    getBlocsList(options?: { includeInactive?: boolean }): Promise<
        Array<{
            id: string;
            compositionHTML?: TBloc["compositionHTML"];
            componentHTML?: TBloc["componentHTML"];
            nativeElement?: TBloc["nativeElement"];
            slots?: TBloc["slots"];
            settings?: BlocSettings;
        }>
    >;
};

/**
 * Server-side Page grammar gate. Every root is an active Bloc and every child
 * must satisfy the direct parent's managed-native or named-slot contract.
 */
export async function assertContentRefsExist(repository: ContentRefsReader, content: string): Promise<void> {
    if (!content) {
        return;
    }

    const registeredBlocs = await repository.getBlocsList();
    validatePageDocument(
        content,
        registeredBlocs.map((bloc) => ({
            id: bloc.id,
            kind: bloc.compositionHTML === undefined ? "component" : "composition",
            slots: bloc.slots ?? {},
            ...(bloc.nativeElement ? { nativeElement: bloc.nativeElement } : {}),
            ...(bloc.settings ? { settings: bloc.settings } : {}),
        })),
    );
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = content;
    try {
        expandCompositions(document.body, registeredBlocs);
        validateStateQueryGraph(document.body);
    } catch (error) {
        throw new ContentValidationError(
            "content",
            error instanceof Error ? error.message : "invalid automatic state query graph",
        );
    }
}

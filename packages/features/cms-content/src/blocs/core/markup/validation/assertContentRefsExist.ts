import type { TBloc } from "cms-content/blocs/interfaces/blocs";
import type { BlocSettings } from "cms-content/pages/interfaces/document";
import { validatePageDocument } from "cms-content/blocs/core/markup/validation/documents/pageDocument";

/** Minimal reader — `CmsRepository` satisfies it structurally. */
export type ContentRefsReader = {
    getBlocsList(options?: { includeInactive?: boolean }): Promise<
        Array<{
            id: string;
            compositionHTML?: TBloc["compositionHTML"];
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
}

import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { CompositionDefinition } from "@bernouy/cms-content/rendering";

export function collectionDocumentDefinitions(blocs: readonly CollectionBloc[]): readonly CompositionDefinition[] {
    return blocs.map((bloc) => ({
        id: bloc.id,
        kind: bloc.kind,
        markupHTML: bloc.markup,
    }));
}

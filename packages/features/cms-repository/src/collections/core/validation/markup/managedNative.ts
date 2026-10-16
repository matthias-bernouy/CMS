import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";

export function validateManagedNativeDefinition(bloc: CollectionBloc, path: string): void {
    if (bloc.root.accepts.length === 0) {
        invalid("root must accept at least one native element", `${path}.root.accepts`);
    }
}

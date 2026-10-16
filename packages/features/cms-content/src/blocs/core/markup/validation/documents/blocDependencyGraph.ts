import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { extractRefs } from "cms-content/blocs/core/markup/contentRefs";

export type BlocDependencyNode = {
    readonly id: string;
    readonly uses?: readonly string[];
    readonly compositionHTML?: string;
    readonly templateHTML?: string;
    readonly defaultContent?: string;
};

/** Enforces one acyclic graph across declared and persisted Bloc references. */
export function assertAcyclicBlocDependencies(blocs: readonly BlocDependencyNode[]): void {
    const byId = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    const state = new Map<string, "visiting" | "visited">();
    const path: string[] = [];

    const visit = (id: string): void => {
        if (state.get(id) === "visited") {
            return;
        }
        if (state.get(id) === "visiting") {
            const start = path.indexOf(id);
            throw new ContentValidationError(
                "uses",
                `cyclic Bloc dependency: ${[...path.slice(start), id].join(" -> ")}`,
            );
        }
        state.set(id, "visiting");
        path.push(id);
        for (const dependency of dependenciesOf(byId.get(id)!)) {
            if (byId.has(dependency)) {
                visit(dependency);
            }
        }
        path.pop();
        state.set(id, "visited");
    };

    for (const id of [...byId.keys()].sort()) {
        visit(id);
    }
}

function dependenciesOf(bloc: BlocDependencyNode): string[] {
    const dependencies = new Set(bloc.uses ?? []);
    for (const markup of [bloc.compositionHTML, bloc.templateHTML, bloc.defaultContent]) {
        if (markup) {
            for (const dependency of extractRefs(markup).blocs) {
                dependencies.add(dependency);
            }
        }
    }
    return [...dependencies].sort();
}

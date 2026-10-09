import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import { invalid } from "../../errors";
import { elements, isElement, type MarkupTree } from "../markup/tree";
import { pageBlocHostAttributesIssue } from "./hostAttributes";

/** Validate attributes owned by locally known Bloc hosts in a Page document. */
export function validatePageBlocHosts(
    tree: MarkupTree,
    blocs: ReadonlyMap<string, CollectionBloc>,
    importedBlocs: ReadonlySet<string>,
    path: string,
): void {
    for (const host of elements(tree)) {
        const bloc = blocs.get(host.name);
        if (!bloc) {
            continue;
        }
        const parent = host.parent;
        const nested = Boolean(
            parent && isElement(parent) && (blocs.has(parent.name) || importedBlocs.has(parent.name)),
        );
        const issue = pageBlocHostAttributesIssue(
            host.attribs,
            { id: bloc.id, settings: bloc.kind === "component" ? bloc.settings : undefined },
            nested,
        );
        if (issue) {
            invalid(issue, path);
        }
    }
}

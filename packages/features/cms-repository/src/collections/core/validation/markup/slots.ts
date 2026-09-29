import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import { elements, isElement, type MarkupElement, type MarkupTree, offeredSlots } from "./tree";

export interface BlocMarkup {
    readonly light?: MarkupTree;
    readonly shadow?: MarkupTree;
    readonly initial?: MarkupTree;
    readonly shellSlots: ReadonlySet<string>;
    readonly pageSlots: ReadonlySet<string>;
}

export function validatePageSlots(bloc: CollectionBloc, markup: BlocMarkup, path: string): void {
    if (markup.pageSlots.has("")) {
        invalid("slots the page fills must have a name", `${path}.slots`);
    }
    for (const name of markup.pageSlots) {
        if (!Object.hasOwn(bloc.slots, name)) {
            invalid(`must declare page slot ${name}`, `${path}.slots`);
        }
    }
    for (const name of Object.keys(bloc.slots)) {
        if (!markup.pageSlots.has(name)) {
            invalid(`declared slot ${name} does not exist in the page template`, `${path}.slots.${name}`);
        }
    }
}

function targets(
    node: MarkupElement,
    tree: MarkupTree,
    rootSlots: ReadonlySet<string>,
    blocs: ReadonlyMap<string, CollectionBloc>,
    markup: ReadonlyMap<string, BlocMarkup>,
): ReadonlySet<string> | undefined {
    const parent = node.parent;
    if (parent === tree || (parent && isElement(parent) && parent.name === "cms-host")) {
        return rootSlots;
    }
    if (!parent || !isElement(parent)) {
        return undefined;
    }
    const target = blocs.get(parent.name);
    const content = markup.get(parent.name);
    return target?.kind === "component" && !content?.light ? content?.shellSlots : content?.pageSlots;
}

export function validateSlotTargets(
    tree: MarkupTree,
    rootSlots: ReadonlySet<string>,
    blocs: ReadonlyMap<string, CollectionBloc>,
    markup: ReadonlyMap<string, BlocMarkup>,
    path: string,
): void {
    for (const node of elements(tree)) {
        const name = node.attribs.slot;
        if (name !== undefined && !targets(node, tree, rootSlots, blocs, markup)?.has(name)) {
            invalid(`slot target ${JSON.stringify(name)} does not exist on its direct parent host`, path);
        }
    }
}

export function pageSlots(light: MarkupTree | undefined, shadow: MarkupTree | undefined): ReadonlySet<string> {
    const tree = light ?? shadow;
    return tree ? offeredSlots(tree) : new Set();
}

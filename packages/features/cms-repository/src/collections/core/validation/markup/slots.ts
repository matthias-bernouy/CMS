import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import { elements, isElement, type MarkupElement, type MarkupTree, offeredSlots } from "./tree";

export interface BlocMarkup {
    readonly template?: MarkupTree;
    readonly initial?: MarkupTree;
    readonly pageSlots: ReadonlySet<string>;
}

export function validatePageSlots(bloc: CollectionBloc, markup: BlocMarkup, path: string): void {
    if (markup.pageSlots.has("") && !bloc.content) {
        invalid("an unnamed slot requires a managed Page-owned native child", `${path}.content`);
    }
    if (bloc.content && !markup.pageSlots.has("")) {
        invalid("managed Page-owned native content requires one unnamed slot", `${path}.content`);
    }
    for (const name of markup.pageSlots) {
        if (name === "") {
            continue;
        }
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
    if (
        parent === tree ||
        (parent && isElement(parent) && parent.name === "template" && parent.attribs["cms-root"] !== undefined)
    ) {
        return rootSlots;
    }
    if (!parent || !isElement(parent)) {
        return undefined;
    }
    const targetId = parent.attribs["cms-bloc"];
    const target = targetId ? blocs.get(targetId) : undefined;
    const content = targetId ? markup.get(targetId) : undefined;
    return target ? content?.pageSlots : undefined;
}

export function validateSlotTargets(
    tree: MarkupTree,
    rootSlots: ReadonlySet<string>,
    blocs: ReadonlyMap<string, CollectionBloc>,
    markup: ReadonlyMap<string, BlocMarkup>,
    path: string,
    importedBlocs: ReadonlySet<string> = new Set(),
): void {
    for (const node of elements(tree)) {
        const name = node.attribs.slot;
        const parent = node.parent;
        if (name !== undefined && parent && isElement(parent) && importedBlocs.has(parent.attribs["cms-bloc"] ?? "")) {
            continue;
        }
        if (name !== undefined && !targets(node, tree, rootSlots, blocs, markup)?.has(name)) {
            invalid(`slot target ${JSON.stringify(name)} does not exist on its direct parent host`, path);
        }
    }
}

export function pageSlots(template: MarkupTree | undefined): ReadonlySet<string> {
    const tree = template;
    return tree ? offeredSlots(tree) : new Set();
}

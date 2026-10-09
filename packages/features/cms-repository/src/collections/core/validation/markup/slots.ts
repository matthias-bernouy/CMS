import type {
    CollectionBloc,
    CollectionSlot,
    CollectionSlotAccept,
} from "cms-repository/collections/interfaces/CollectionBloc";
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
    if (bloc.kind === "component" && bloc.nativeElement) {
        return;
    }
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
    importedBlocs: ReadonlySet<string> = new Set(),
): void {
    for (const node of elements(tree)) {
        const name = node.attribs.slot;
        const parent = node.parent;
        if (name !== undefined && parent && isElement(parent) && importedBlocs.has(parent.name)) {
            continue;
        }
        if (name !== undefined && !targets(node, tree, rootSlots, blocs, markup)?.has(name)) {
            invalid(`slot target ${JSON.stringify(name)} does not exist on its direct parent host`, path);
        }
    }
}

export function pageSlots(light: MarkupTree | undefined, shadow: MarkupTree | undefined): ReadonlySet<string> {
    const tree = light ?? shadow;
    return tree ? offeredSlots(tree) : new Set();
}

const INLINE_ROOTS = new Set([
    "a",
    "abbr",
    "b",
    "br",
    "cite",
    "code",
    "em",
    "figcaption",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "label",
    "p",
    "small",
    "span",
    "strong",
]);
const INLINE_CHILDREN = new Set(["a", "abbr", "b", "br", "cite", "code", "em", "small", "span", "strong"]);
const PROSE_ROOTS = new Set([...INLINE_ROOTS, "blockquote", "div", "ol", "p", "pre", "ul"]);
const PROSE_CHILDREN = new Set([...PROSE_ROOTS, "li"]);
export function slotAcceptsBloc(accept: CollectionSlotAccept, tag: string, bloc?: CollectionBloc): boolean {
    if (accept.kind === "any-component") {
        return bloc?.kind === "component" || bloc === undefined;
    }
    if (accept.kind === "component") {
        return accept.tag === tag && (bloc?.kind === "component" || bloc === undefined);
    }
    return false;
}

export function slotAcceptsNative(slot: CollectionSlot, element: MarkupElement): boolean {
    return (slot.accepts ?? []).some((accept) => {
        if (accept.kind === "plain-text") {
            return element.name === "span" && !element.children.some(isElement);
        }
        if (accept.kind !== "rich-text") {
            return false;
        }
        const roots = accept.profile === "inline" ? INLINE_ROOTS : PROSE_ROOTS;
        const descendants = accept.profile === "inline" ? INLINE_CHILDREN : PROSE_CHILDREN;
        return roots.has(element.name) && nativeChildrenMatch(element, descendants);
    });
}

function nativeChildrenMatch(element: MarkupElement, allowed: ReadonlySet<string>): boolean {
    return element.children.every(
        (child) => !isElement(child) || (allowed.has(child.name) && nativeChildrenMatch(child, allowed)),
    );
}

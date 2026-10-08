import type { CollectionBloc, CollectionSlot } from "../../../interfaces/CollectionBloc";
import { invalid } from "../../errors";
import { elements, isElement, type MarkupElement, type MarkupNode, type MarkupTree, significantRoots } from "./tree";
import { slotAcceptsBloc, slotAcceptsNative } from "./slots";

export function validateDefaultSlotContracts(
    tree: MarkupTree,
    owner: CollectionBloc,
    blocs: ReadonlyMap<string, CollectionBloc>,
    importedBlocs: ReadonlySet<string>,
    path: string,
): void {
    validateChildren(significantRoots(tree), owner, blocs, importedBlocs, path);
}

export function validatePageDocumentSlotContracts(
    tree: MarkupTree,
    blocs: ReadonlyMap<string, CollectionBloc>,
    importedBlocs: ReadonlySet<string>,
    path: string,
): void {
    for (const root of significantRoots(tree)) {
        if (!isElement(root)) {
            invalid("Page root text must be owned by a Bloc slot", path);
        }
        const owner = blocs.get(root.name);
        if (!owner && !importedBlocs.has(root.name)) {
            invalid(`Page root ${root.name} is not a collection Bloc`, path);
        }
        if (owner) {
            validateChildren(significantChildren(root), owner, blocs, importedBlocs, path);
        }
    }
}

export function validateFixedLightDomSlotContracts(
    tree: MarkupTree,
    blocs: ReadonlyMap<string, CollectionBloc>,
    importedBlocs: ReadonlySet<string>,
    path: string,
): void {
    for (const host of elements(tree)) {
        const owner = blocs.get(host.name);
        if (owner) {
            validateFixedChildren(significantChildren(host), owner, blocs, importedBlocs, path);
        }
    }
}

function validateFixedChildren(
    children: readonly MarkupNode[],
    owner: CollectionBloc,
    blocs: ReadonlyMap<string, CollectionBloc>,
    importedBlocs: ReadonlySet<string>,
    path: string,
): void {
    if (owner.kind === "component" && owner.nativeElement) {
        return;
    }
    const counts = new Map<string, number>();
    for (const child of children) {
        if (!isElement(child)) {
            continue;
        }
        const name = child.attribs.slot ?? "";
        const slot = owner.slots[name];
        if (!slot) {
            invalid(`slot target ${JSON.stringify(name || "(default)")} does not exist on ${owner.id}`, path);
        }
        if (child.name !== "slot" && (blocs.has(child.name) || importedBlocs.has(child.name))) {
            const nested = blocs.get(child.name);
            if (!(slot.accepts ?? []).some((accept) => slotAcceptsBloc(accept, child.name, nested))) {
                invalid(`slot does not accept Bloc ${child.name}`, path);
            }
        }
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    validateCardinality(owner, counts, path);
}

function validateChildren(
    children: readonly MarkupNode[],
    owner: CollectionBloc,
    blocs: ReadonlyMap<string, CollectionBloc>,
    importedBlocs: ReadonlySet<string>,
    path: string,
): void {
    if (owner.kind === "component" && owner.nativeElement) {
        return;
    }
    const counts = new Map<string, number>();
    for (const child of children) {
        if (!isElement(child)) {
            invalid(`text must be owned by a declared slot on ${owner.id}`, path);
        }
        const name = child.attribs.slot ?? "";
        const slot = owner.slots[name];
        if (!slot) {
            invalid(`slot target ${JSON.stringify(name || "(default)")} does not exist on ${owner.id}`, path);
        }
        if (child.name !== "slot") {
            validateChild(child, slot, blocs, importedBlocs, path);
        }
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    validateCardinality(owner, counts, path);
}

function validateCardinality(owner: CollectionBloc, counts: ReadonlyMap<string, number>, path: string): void {
    for (const [name, slot] of Object.entries(owner.slots)) {
        const count = counts.get(name) ?? 0;
        if (slot.min !== undefined && count < slot.min) {
            invalid(`slot ${name} requires at least ${slot.min} item(s)`, path);
        }
        if (slot.max !== undefined && count > slot.max) {
            invalid(`slot ${name} accepts at most ${slot.max} item(s)`, path);
        }
    }
}

function validateChild(
    child: MarkupElement,
    slot: CollectionSlot,
    blocs: ReadonlyMap<string, CollectionBloc>,
    importedBlocs: ReadonlySet<string>,
    path: string,
): void {
    const nested = blocs.get(child.name);
    if (nested || importedBlocs.has(child.name)) {
        if (!(slot.accepts ?? []).some((accept) => slotAcceptsBloc(accept, child.name, nested))) {
            invalid(`slot does not accept Bloc ${child.name}`, path);
        }
        if (nested) {
            validateChildren(significantChildren(child), nested, blocs, importedBlocs, path);
        }
        return;
    }
    if (!slotAcceptsNative(slot, child)) {
        invalid(`slot does not accept native ${child.name}`, path);
    }
}

function significantChildren(element: MarkupElement): MarkupNode[] {
    return element.children.filter(
        (node) => node.type !== "comment" && (node.type !== "text" || node.data.trim().length > 0),
    );
}

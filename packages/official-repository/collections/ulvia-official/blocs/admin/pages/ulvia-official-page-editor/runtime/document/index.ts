import type { EditorCatalogueItem, EditorSlot } from "../model";
import { contentFields, type EditableContentField, updateContentField } from "./content";
import { createBlocElement } from "./factory";
import { type EditableNativeElement, nativeElementFields, updateNativeElementAttribute } from "./native";
import { acceptsItem, componentSlots, slotDefinition } from "./slots";
import {
    addressOf,
    blocChildren,
    blocNodes,
    elementAt,
    type EditableInsertionTarget,
    type EditablePageNode,
    insertionTarget,
    parentBloc,
} from "./tree";

export type { EditableContentField } from "./content";
export type { EditableNativeAttribute, EditableNativeElement } from "./native";
export type { EditableInsertionTarget, EditablePageNode } from "./tree";

export class EditablePageDocument {
    private readonly template = document.createElement("template");

    constructor(source: string) {
        this.replace(source);
    }

    replace(source: string): void {
        this.template.innerHTML = source;
    }

    serialize(): string {
        return this.template.innerHTML;
    }

    elements(): HTMLElement[] {
        return this.nodes().map(({ element }) => element);
    }

    nodes(): EditablePageNode[] {
        return blocNodes(this.template.content);
    }

    children(parent: HTMLElement | null, slot?: string): HTMLElement[] {
        return blocChildren(this.template.content, parent, slot);
    }

    add(item: EditorCatalogueItem, target: EditableInsertionTarget = { parent: null, slot: "" }): HTMLElement {
        const element = createBlocElement(item);
        if (target.slot) {
            element.setAttribute("slot", target.slot);
        }
        (target.parent ?? this.template.content).append(element);
        return element;
    }

    canInsert(
        item: EditorCatalogueItem,
        target: EditableInsertionTarget,
        catalogue: readonly EditorCatalogueItem[],
    ): boolean {
        if (!target.parent) {
            return true;
        }
        const slot = slotDefinition(this.itemForElement(target.parent, catalogue), target.slot);
        return Boolean(slot && acceptsItem(slot, item) && this.hasCapacity(target, slot));
    }

    insertionSlots(parent: HTMLElement, catalogue: readonly EditorCatalogueItem[]): string[] {
        const item = this.itemForElement(parent, catalogue);
        if (!item) {
            return [];
        }
        return componentSlots(item)
            .filter(([name, slot]) => this.hasCapacity({ parent, slot: name }, slot))
            .map(([name]) => name);
    }

    canRemove(element: HTMLElement, catalogue: readonly EditorCatalogueItem[]): boolean {
        const target = insertionTarget(element);
        if (!target.parent) {
            return true;
        }
        const slot = slotDefinition(this.itemForElement(target.parent, catalogue), target.slot);
        return !slot || this.slotOccupancy(target.parent, target.slot) > (slot.min ?? 0);
    }

    remove(element: HTMLElement, catalogue: readonly EditorCatalogueItem[]): HTMLElement | null {
        if (!this.canRemove(element, catalogue)) {
            return element;
        }
        const siblings = this.siblings(element);
        const index = siblings.indexOf(element);
        const parent = parentBloc(element);
        element.remove();
        return siblings[index + 1] ?? siblings[index - 1] ?? parent;
    }

    duplicate(element: HTMLElement, catalogue: readonly EditorCatalogueItem[]): HTMLElement | null {
        const item = this.itemForElement(element, catalogue);
        const target = insertionTarget(element);
        if (!item || !this.canInsert(item, target, catalogue)) {
            return null;
        }
        const clone = element.cloneNode(true) as HTMLElement;
        element.after(clone);
        return clone;
    }

    move(element: HTMLElement, offset: -1 | 1): HTMLElement {
        const siblings = this.siblings(element);
        const index = siblings.indexOf(element);
        const target = siblings[index + offset];
        if (!target) {
            return element;
        }
        if (offset < 0) {
            target.before(element);
        } else {
            target.after(element);
        }
        return element;
    }

    canMove(element: HTMLElement, offset: -1 | 1): boolean {
        const siblings = this.siblings(element);
        return Boolean(siblings[siblings.indexOf(element) + offset]);
    }

    contentFields(element: HTMLElement, item?: EditorCatalogueItem): EditableContentField[] {
        return contentFields(element, item);
    }

    updateContentField(element: HTMLElement, address: string, content: string): void {
        updateContentField(element, address, content);
    }

    nativeElementFields(element: HTMLElement, item?: EditorCatalogueItem): EditableNativeElement[] {
        return nativeElementFields(element, item);
    }

    updateNativeElementAttribute(element: HTMLElement, slot: string, name: string, value: string | boolean): void {
        updateNativeElementAttribute(element, slot, name, value);
    }

    updateAttribute(element: HTMLElement, name: string, value: string | boolean): void {
        if (typeof value === "boolean") {
            element.toggleAttribute(name, value);
        } else if (value === "") {
            element.removeAttribute(name);
        } else {
            element.setAttribute(name, value);
        }
    }

    replaceRootTag(element: HTMLElement, tag: string): HTMLElement {
        if (element.localName === tag) {
            return element;
        }
        const replacement = document.createElement(tag);
        for (const attribute of element.attributes) {
            replacement.setAttribute(attribute.name, attribute.value);
        }
        replacement.append(...Array.from(element.childNodes));
        element.replaceWith(replacement);
        return replacement;
    }

    addressOf(element: HTMLElement | null): number[] | null {
        return addressOf(this.template.content, element);
    }

    elementAt(address: readonly number[] | null): HTMLElement | null {
        return elementAt(this.template.content, address);
    }

    private hasCapacity(target: EditableInsertionTarget, slot: EditorSlot): boolean {
        return slot.max === undefined || this.slotOccupancy(target.parent, target.slot) < slot.max;
    }

    private slotOccupancy(parent: HTMLElement, slot: string): number {
        return Array.from(parent.childNodes).filter((child) => {
            if (child instanceof HTMLElement) {
                return (child.getAttribute("slot") ?? "") === slot;
            }
            return !slot && Boolean(child.textContent?.trim());
        }).length;
    }

    private itemForElement(
        element: HTMLElement,
        catalogue: readonly EditorCatalogueItem[],
    ): EditorCatalogueItem | undefined {
        const id = element.getAttribute("cms-bloc");
        return catalogue.find((item) => item.id === id);
    }

    private siblings(element: HTMLElement): HTMLElement[] {
        const target = insertionTarget(element);
        return this.children(target.parent, target.slot);
    }
}

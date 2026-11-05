import { EditablePageDocument, type EditableInsertionTarget } from "../document/index";
import { EditorHistory, type EditorSnapshot } from "../document/history";
import type { EditorCatalogueItem } from "../model";

export class PageEditingState {
    readonly document = new EditablePageDocument("");
    readonly history = new EditorHistory();
    selected: HTMLElement | null = null;
    insertionTarget: EditableInsertionTarget = { parent: null, slot: "" };

    initialize(content: string): void {
        this.document.replace(content);
        this.selected = this.document.elements()[0] ?? null;
        this.insertionTarget = { parent: null, slot: "" };
        this.history.reset();
    }

    add(item: EditorCatalogueItem, catalogue: readonly EditorCatalogueItem[]): boolean {
        if (!this.document.canInsert(item, this.insertionTarget, catalogue)) {
            return false;
        }
        return this.mutate(() => {
            this.selected = this.document.add(item, this.insertionTarget);
        });
    }

    select(address: string): void {
        this.selected = this.document.elementAt(parseAddress(address));
    }

    setInsertionTarget(parentAddress: string, slot: string): boolean {
        const parent = this.document.elementAt(parseAddress(parentAddress));
        if (!parent) {
            return false;
        }
        this.insertionTarget = { parent, slot };
        return true;
    }

    move(offset: -1 | 1): boolean {
        return this.mutate(() => {
            if (this.selected) {
                this.selected = this.document.move(this.selected, offset);
            }
        });
    }

    duplicate(catalogue: readonly EditorCatalogueItem[]): boolean {
        return this.mutate(() => {
            if (this.selected) {
                this.selected = this.document.duplicate(this.selected, catalogue) ?? this.selected;
            }
        });
    }

    remove(catalogue: readonly EditorCatalogueItem[]): boolean {
        return this.mutate(() => {
            if (this.selected) {
                this.selected = this.document.remove(this.selected, catalogue);
            }
        });
    }

    updateContent(address: string, value: string): HTMLElement | null {
        const selected = this.selected;
        if (selected) {
            this.mutate(() => {
                this.document.updateContentField(selected, address, value);
            });
        }
        return selected;
    }

    updateSetting(name: string, value: string | boolean): HTMLElement | null {
        return this.updateAttribute(name, value);
    }

    updateRootAttribute(name: string, value: string): HTMLElement | null {
        return this.updateAttribute(name, value);
    }

    updateNativeAttribute(slot: string, name: string, value: string | boolean): HTMLElement | null {
        const selected = this.selected;
        if (selected) {
            this.mutate(() => {
                this.document.updateNativeElementAttribute(selected, slot, name, value);
            });
        }
        return selected;
    }

    private updateAttribute(name: string, value: string | boolean): HTMLElement | null {
        const selected = this.selected;
        if (selected) {
            this.mutate(() => {
                this.document.updateAttribute(selected, name, value);
            });
        }
        return selected;
    }

    updateRootTag(tag: string, item?: EditorCatalogueItem): HTMLElement | null {
        const selected = this.selected;
        const accepted = item ? authoringRootTags(item) : [];
        if (!selected || !accepted.includes(tag)) {
            return null;
        }
        this.mutate(() => {
            this.selected = this.document.replaceRootTag(selected, tag);
        });
        return this.selected;
    }

    undo(): boolean {
        return this.restore(this.history.undo(this.snapshot()));
    }

    redo(): boolean {
        return this.restore(this.history.redo(this.snapshot()));
    }

    applySaved(content: string): void {
        const address = this.document.addressOf(this.selected);
        this.document.replace(content);
        this.selected = this.document.elementAt(address);
        this.history.reset();
    }

    private mutate(operation: () => void): boolean {
        const before = this.snapshot();
        operation();
        if (before.source === this.document.serialize()) {
            return false;
        }
        this.history.record(before);
        return true;
    }

    private restore(snapshot: EditorSnapshot | null): boolean {
        if (!snapshot) {
            return false;
        }
        this.document.replace(snapshot.source);
        this.selected = this.document.elementAt(snapshot.selection);
        this.insertionTarget = { parent: null, slot: "" };
        return true;
    }

    private snapshot(): EditorSnapshot {
        return { source: this.document.serialize(), selection: this.document.addressOf(this.selected) };
    }
}

function authoringRootTags(item: EditorCatalogueItem): string[] {
    try {
        const contract = JSON.parse(item.authoringJson) as { root?: { accepts?: string[] } };
        return contract.root?.accepts ?? [];
    } catch {
        return [];
    }
}

function parseAddress(value: string): number[] {
    return value ? value.split(".").map(Number) : [];
}

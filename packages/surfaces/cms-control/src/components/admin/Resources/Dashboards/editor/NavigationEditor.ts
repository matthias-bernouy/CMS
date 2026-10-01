import type { AvailableView, NavigationItem } from "../domain/types";
import { fillItemDialog, readItemDialog, syncItemKind } from "./dialog";
import { itemAt, listAt, moveItem, navigationError, reorderItem } from "./tree";
import { renderTree } from "./treeView";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type Modal = HTMLElement & { showModal(): void; hide(): void };
type ValueControl = HTMLElement & { value: string };

export class DashboardNavigationEditor extends HTMLElement {
    private items: NavigationItem[] = [];
    private available: AvailableView[] = [];
    private editing: number[] | null = null;
    private snapshot: NavigationItem[] | null = null;
    private dragging: number[] | null = null;

    connectedCallback(): void {
        if (this.querySelector("[data-tree]")) {
            return;
        }
        this.innerHTML = `<style>${css}</style>${template}`;
        this.querySelector("[data-add-root]")!.addEventListener("click", () => this.add([]));
        const tree = this.querySelector("[data-tree]")!;
        tree.addEventListener("click", (event) => this.onTreeClick(event));
        tree.addEventListener("dragstart", (event) => this.onDragStart(event as DragEvent));
        tree.addEventListener("dragover", (event) => this.onDragOver(event as DragEvent));
        tree.addEventListener("drop", (event) => this.onDrop(event as DragEvent));
        tree.addEventListener("dragend", () => this.clearDragState());
        this.querySelector("[data-item-form]")!.addEventListener("submit", (event) => this.saveItem(event));
        this.querySelector("[data-cancel]")!.addEventListener("click", () => this.cancelItem());
        this.querySelector("[data-kind]")!.addEventListener("change", () => {
            syncItemKind(this);
            this.suggestView();
        });
        this.querySelector("[data-view]")!.addEventListener("change", () => this.suggestView());
        this.querySelector("[data-dialog]")!.addEventListener("close", () => this.restoreSnapshot());
        this.render();
    }

    get value(): NavigationItem[] {
        return structuredClone(this.items);
    }

    set value(value: NavigationItem[]) {
        this.items = structuredClone(value);
        this.render();
    }

    set views(value: AvailableView[]) {
        this.available = value;
        this.render();
    }

    validationMessage(): string {
        return navigationError(this.items);
    }

    private render(): void {
        const tree = this.querySelector("[data-tree]");
        if (!tree) {
            return;
        }
        tree.replaceChildren(...renderTree(this.items, this.available).children);
        this.querySelector("[data-empty]")!.toggleAttribute("hidden", this.items.length > 0);
        this.querySelector("[data-tree]")!.toggleAttribute("hidden", this.items.length === 0);
        (this.querySelector("[data-add-root]") as HTMLElement & { disabled: boolean }).disabled =
            this.available.length === 0;
    }

    private onTreeClick(event: Event): void {
        const target = event.target as Element;
        const path = this.pathFrom(target);
        if (!path) {
            return;
        }
        const button = target.closest<HTMLElement>("[data-action]");
        if (!button) {
            return;
        }
        const action = button.dataset.action;
        if (action === "edit") {
            this.open(path);
        } else if (action === "add-child") {
            this.add(path);
        } else if (action === "delete") {
            listAt(this.items, path.slice(0, -1))?.splice(path.at(-1)!, 1);
            this.changed();
        } else if (action && moveItem(this.items, path, action)) {
            this.changed();
        }
    }

    private onDragStart(event: DragEvent): void {
        const target = event.target as Element;
        if (!target.closest("[data-drag-handle]")) {
            event.preventDefault();
            return;
        }
        this.dragging = this.pathFrom(target);
        event.dataTransfer?.setData("text/plain", this.dragging?.join(".") ?? "");
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
        target.closest<HTMLElement>("[data-path]")?.setAttribute("data-dragging", "");
    }

    private onDragOver(event: DragEvent): void {
        const target = (event.target as Element).closest<HTMLElement>("[data-path]");
        const targetPath = target ? this.pathFrom(target) : null;
        if (!target || !targetPath || !this.sameParent(this.dragging, targetPath)) {
            return;
        }
        event.preventDefault();
        this.querySelectorAll("[data-drop-position]").forEach((row) => row.removeAttribute("data-drop-position"));
        const after = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
        target.dataset.dropPosition = after ? "after" : "before";
    }

    private onDrop(event: DragEvent): void {
        const target = (event.target as Element).closest<HTMLElement>("[data-path]");
        const targetPath = target ? this.pathFrom(target) : null;
        const after = target?.dataset.dropPosition === "after";
        event.preventDefault();
        if (this.dragging && targetPath && reorderItem(this.items, this.dragging, targetPath, after)) {
            this.changed();
        }
        this.clearDragState();
    }

    private sameParent(left: number[] | null, right: number[]): boolean {
        return Boolean(left && left.slice(0, -1).join(".") === right.slice(0, -1).join("."));
    }

    private clearDragState(): void {
        this.dragging = null;
        this.querySelectorAll("[data-dragging], [data-drop-position]").forEach((row) => {
            row.removeAttribute("data-dragging");
            row.removeAttribute("data-drop-position");
        });
    }

    private add(parentPath: number[]): void {
        const snapshot = structuredClone(this.items);
        const list = listAt(this.items, parentPath);
        if (!list || parentPath.length >= 3) {
            return;
        }
        this.snapshot = snapshot;
        const view = this.firstUnusedView();
        const item: NavigationItem = {
            id: `item-${crypto.randomUUID()}`,
            label: view?.name.slice(0, 32) ?? "New group",
            icon: view?.icon ?? "layout",
            ...(view ? { use: `${view.collectionId}:${view.viewId}` } : {}),
        };
        list.push(item);
        const parent = parentPath.length ? itemAt(this.items, parentPath) : null;
        if (parent) {
            parent.childPlacement ??= parentPath.length === 1 ? "lateral" : "tabs";
        }
        this.open([...parentPath, list.length - 1], true);
        this.render();
    }

    private open(path: number[], created = false): void {
        const item = itemAt(this.items, path);
        if (!item) {
            return;
        }
        if (!created) {
            this.snapshot = structuredClone(this.items);
        }
        this.editing = path;
        fillItemDialog(this, item, path, this.available, this.usedViews(item.use));
        this.modal().showModal();
    }

    private saveItem(event: Event): void {
        event.preventDefault();
        const item = this.editing && itemAt(this.items, this.editing);
        const draft = readItemDialog(this);
        if (!item || !this.editing || !draft) {
            return;
        }
        item.label = draft.label;
        item.icon = draft.icon;
        if (draft.kind === "view") {
            item.use = draft.use!;
        } else {
            delete item.use;
        }
        if (item.children?.length) {
            item.childPlacement = this.editing.length === 2 ? "tabs" : draft.placement;
        } else {
            delete item.childPlacement;
        }
        this.snapshot = null;
        this.editing = null;
        this.modal().hide();
        this.changed();
    }

    private cancelItem(): void {
        this.restoreSnapshot();
        this.modal().hide();
    }

    private restoreSnapshot(): void {
        if (this.snapshot) {
            this.items = this.snapshot;
            this.snapshot = null;
            this.editing = null;
            this.render();
        }
    }

    private changed(): void {
        this.render();
        this.dispatchEvent(new CustomEvent("navigation-change", { bubbles: true, composed: true }));
    }

    private usedViews(except?: string): Set<string> {
        return new Set(this.walk(this.items).flatMap((item) => (item.use && item.use !== except ? [item.use] : [])));
    }

    private firstUnusedView(): AvailableView | undefined {
        const used = this.usedViews();
        return this.available.find((view) => !used.has(`${view.collectionId}:${view.viewId}`));
    }

    private suggestView(): void {
        if ((this.querySelector("[data-kind]") as ValueControl).value !== "view") {
            return;
        }
        const use = (this.querySelector("[data-view]") as ValueControl).value;
        const view = this.available.find((candidate) => `${candidate.collectionId}:${candidate.viewId}` === use);
        if (!view) {
            return;
        }
        const label = this.querySelector("[data-label]") as ValueControl;
        const icon = this.querySelector("[data-icon]") as ValueControl;
        label.value = view.name.slice(0, 32);
        icon.value = view.icon;
    }

    private walk(items: NavigationItem[]): NavigationItem[] {
        return items.flatMap((item) => [item, ...this.walk(item.children ?? [])]);
    }

    private pathFrom(target: Element): number[] | null {
        const value = target.closest<HTMLElement>("[data-path]")?.dataset.path;
        return value ? value.split(".").map(Number) : null;
    }

    private modal(): Modal {
        return this.querySelector("[data-dialog]") as Modal;
    }
}

customElements.define("cms-dashboard-navigation-editor", DashboardNavigationEditor);

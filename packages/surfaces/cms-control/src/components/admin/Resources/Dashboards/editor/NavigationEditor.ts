import type { AvailableView, NavigationItem } from "../domain/types";
import { fillItemDialog, readItemDialog, syncItemKind } from "./dialog";
import { canRelocateItem, itemAt, listAt, moveItem, navigationError, relocateItem, type DropPosition } from "./tree";
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
    private dragHandle: HTMLElement | null = null;
    private dragPointerId: number | null = null;
    private dragOrigin = { x: 0, y: 0 };
    private dragStarted = false;
    private dropTarget: HTMLElement | null = null;
    private dropPosition: DropPosition | null = null;
    private readonly clearDragOnExit = (): void => this.clearDragState();
    private readonly onPointerMove = (event: PointerEvent): void => this.movePointerDrag(event);
    private readonly onPointerUp = (event: PointerEvent): void => this.finishPointerDrag(event);

    connectedCallback(): void {
        window.removeEventListener("blur", this.clearDragOnExit);
        window.addEventListener("blur", this.clearDragOnExit);
        if (this.querySelector("[data-tree]")) {
            return;
        }
        this.innerHTML = `<style>${css}</style>${template}`;
        this.querySelector("[data-add-root]")!.addEventListener("click", () => this.add([]));
        const tree = this.querySelector("[data-tree]")!;
        tree.addEventListener("click", (event) => this.onTreeClick(event));
        tree.addEventListener("pointerdown", (event) => this.startPointerDrag(event as PointerEvent));
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

    disconnectedCallback(): void {
        window.removeEventListener("blur", this.clearDragOnExit);
        this.clearDragState();
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

    private startPointerDrag(event: PointerEvent): void {
        if (event.button !== 0 || !(event.target instanceof Element)) {
            return;
        }
        const handle = event.target.closest<HTMLElement>("[data-drag-handle]");
        const item = this.dragItem(handle);
        this.dragging = item ? this.pathFrom(item) : null;
        if (!handle || !item || !this.dragging) {
            return;
        }
        event.preventDefault();
        this.dragHandle = handle;
        this.dragPointerId = event.pointerId;
        this.dragOrigin = { x: event.clientX, y: event.clientY };
        this.dragStarted = false;
        handle.setPointerCapture?.(event.pointerId);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointercancel", this.onPointerUp);
    }

    private movePointerDrag(event: PointerEvent): void {
        if (event.pointerId !== this.dragPointerId) {
            return;
        }
        if (!this.dragStarted) {
            const distance = Math.hypot(event.clientX - this.dragOrigin.x, event.clientY - this.dragOrigin.y);
            if (distance < 4) {
                return;
            }
            this.dragStarted = true;
            this.dragItem(this.dragHandle)?.setAttribute("data-dragging", "");
        }
        event.preventDefault();
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        const target = this.dragItem(hit);
        const targetPath = target ? this.pathFrom(target) : null;
        if (!target || !targetPath || !this.dragging) {
            this.clearDropTarget();
            return;
        }
        const row = target.querySelector<HTMLElement>(":scope > .navigation-row")!;
        const bounds = row.getBoundingClientRect();
        const verticalRatio = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5;
        const wantsInside = bounds.width > 0 && event.clientX > bounds.left + Math.min(64, bounds.width / 3);
        const position: DropPosition =
            wantsInside && verticalRatio > 0.22 && verticalRatio < 0.78
                ? "inside"
                : verticalRatio >= 0.5
                  ? "after"
                  : "before";
        if (!canRelocateItem(this.items, this.dragging, targetPath, position)) {
            this.clearDropTarget();
            return;
        }
        this.setDropTarget(target, position);
    }

    private finishPointerDrag(event: PointerEvent): void {
        if (event.pointerId !== this.dragPointerId) {
            return;
        }
        const targetPath = this.dropTarget ? this.pathFrom(this.dropTarget) : null;
        if (
            this.dragStarted &&
            this.dragging &&
            targetPath &&
            this.dropPosition &&
            relocateItem(this.items, this.dragging, targetPath, this.dropPosition)
        ) {
            this.changed();
        }
        this.clearDragState();
    }

    private clearDragState(): void {
        if (this.dragHandle && this.dragPointerId !== null) {
            try {
                this.dragHandle.releasePointerCapture?.(this.dragPointerId);
            } catch {
                // Pointer capture may already have ended outside the document.
            }
        }
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.removeEventListener("pointercancel", this.onPointerUp);
        this.dragging = null;
        this.dragHandle = null;
        this.dragPointerId = null;
        this.dragStarted = false;
        this.querySelectorAll("[data-dragging]").forEach((row) => row.removeAttribute("data-dragging"));
        this.clearDropTarget();
    }

    private setDropTarget(target: HTMLElement, position: DropPosition): void {
        if (this.dropTarget === target && this.dropPosition === position) {
            return;
        }
        this.clearDropTarget();
        this.dropTarget = target;
        this.dropPosition = position;
        target.dataset.dropPosition = position;
    }

    private clearDropTarget(): void {
        this.dropTarget?.removeAttribute("data-drop-position");
        this.dropTarget = null;
        this.dropPosition = null;
    }

    private dragItem(target: EventTarget | null): HTMLElement | null {
        if (!(target instanceof Element)) {
            return null;
        }
        const row = target.closest<HTMLElement>(".navigation-row");
        const item = row?.parentElement;
        return item?.matches("[data-path]") ? item : null;
    }

    private add(parentPath: number[]): void {
        const list = listAt(this.items, parentPath);
        if (!list || !this.canContainChildren(parentPath)) {
            return;
        }
        const view = this.firstUnusedView();
        if (parentPath.length === 2 && !view) {
            return;
        }
        this.snapshot = structuredClone(this.items);
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
        fillItemDialog(this, item, path, this.available, this.usedViews(item.use), this.canContainChildren(path));
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

    private canContainChildren(path: number[]): boolean {
        if (path.length <= 1) {
            return true;
        }
        return path.length === 2 && this.items[path[0]!]?.childPlacement !== "tabs";
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

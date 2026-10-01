import type { AvailableView, NavigationItem } from "../domain/types";
import { itemAt, listAt, moveItem, renderTree } from "./tree";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type ValueControl = HTMLElement & { value: string };
type Modal = HTMLElement & { showModal(): void; hide(): void };

export class DashboardNavigationEditor extends HTMLElement {
    private items: NavigationItem[] = [];
    private available: AvailableView[] = [];
    private editing: number[] | null = null;

    connectedCallback(): void {
        if (this.querySelector("[data-tree]")) {
            return;
        }
        this.innerHTML = `<style>${css}</style>${template}`;
        this.querySelector("[data-add-root]")!.addEventListener("click", () => this.add([]));
        this.querySelector("[data-tree]")!.addEventListener("click", (event) => this.onTreeClick(event));
        this.querySelector("[data-item-form]")!.addEventListener("submit", (event) => this.saveItem(event));
        this.querySelector("[data-cancel]")!.addEventListener("click", () => this.modal().hide());
        this.querySelector("[data-kind]")!.addEventListener("change", () => this.syncKind());
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

    private render(): void {
        const tree = this.querySelector("[data-tree]");
        if (!tree) {
            return;
        }
        tree.replaceChildren(...renderTree(this.items, this.available).children);
        (this.querySelector("[data-add-root]") as HTMLElement & { disabled: boolean }).disabled =
            this.available.length === 0;
    }

    private onTreeClick(event: Event): void {
        const button = (event.target as Element).closest<HTMLElement>("[data-action]");
        const path = button?.closest<HTMLElement>("[data-path]")?.dataset.path?.split(".").map(Number);
        if (!button || !path) {
            return;
        }
        const action = button.dataset.action;
        if (action === "edit") {
            this.open(path);
            return;
        }
        if (action === "add-child") {
            this.add(path);
            return;
        }
        if (action === "delete") {
            listAt(this.items, path.slice(0, -1))?.splice(path.at(-1)!, 1);
            this.changed();
            return;
        }
        if (action && moveItem(this.items, path, action)) {
            this.changed();
        }
    }

    private add(parentPath: number[]): void {
        const parent = parentPath.length ? itemAt(this.items, parentPath) : null;
        const list = listAt(this.items, parentPath);
        if (!list || parentPath.length >= 3) {
            return;
        }
        const used = new Set(this.walk(this.items).flatMap((item) => (item.use ? [item.use] : [])));
        const view = this.available.find((candidate) => !used.has(`${candidate.collectionId}:${candidate.viewId}`));
        if (!view) {
            return;
        }
        const item: NavigationItem = {
            id: `item-${crypto.randomUUID()}`,
            label: view.name.slice(0, 32),
            icon: "layout",
            use: `${view.collectionId}:${view.viewId}`,
        };
        list.push(item);
        if (parent) {
            parent.childPlacement ??= parentPath.length === 1 ? "lateral" : "tabs";
        }
        this.changed();
        this.open([...parentPath, list.length - 1]);
    }

    private open(path: number[]): void {
        const item = itemAt(this.items, path);
        if (!item) {
            return;
        }
        this.editing = path;
        const view = this.field("[data-view]");
        view.replaceChildren(
            ...this.available.map((candidate) => {
                const option = document.createElement("option");
                option.value = `${candidate.collectionId}:${candidate.viewId}`;
                option.textContent = `${candidate.collectionName} / ${candidate.name}`;
                return option;
            }),
        );
        this.setField("[data-kind]", item.use ? "view" : "group");
        const first = this.available[0];
        this.setField("[data-view]", item.use ?? (first ? `${first.collectionId}:${first.viewId}` : ""));
        this.setField("[data-label]", item.label);
        this.setField("[data-icon]", item.icon ?? "layout");
        this.setField("[data-placement]", item.childPlacement ?? (path.length === 1 ? "lateral" : "tabs"));
        this.field("[data-placement]").toggleAttribute("disabled", path.length >= 3);
        this.syncKind();
        this.modal().showModal();
    }

    private saveItem(event: Event): void {
        event.preventDefault();
        const item = this.editing && itemAt(this.items, this.editing);
        if (!item || !this.editing) {
            return;
        }
        const label = this.field("[data-label]").value.trim();
        const kind = this.field("[data-kind]").value;
        const use = this.field("[data-view]").value;
        if (!label || label.length > 32 || (kind === "view" && !use)) {
            return;
        }
        item.label = label;
        item.icon = this.field("[data-icon]").value;
        if (kind === "view") {
            item.use = use;
        } else {
            delete item.use;
        }
        if (item.children?.length) {
            item.childPlacement =
                this.editing.length === 2 ? "tabs" : (this.field("[data-placement]").value as "lateral" | "tabs");
        }
        this.modal().hide();
        this.changed();
    }

    private syncKind(): void {
        this.field("[data-view]").toggleAttribute("disabled", this.field("[data-kind]").value !== "view");
    }

    private changed(): void {
        this.render();
        this.dispatchEvent(new CustomEvent("navigation-change", { bubbles: true }));
    }

    private walk(items: NavigationItem[]): NavigationItem[] {
        return items.flatMap((item) => [item, ...this.walk(item.children ?? [])]);
    }

    private field(selector: string): ValueControl {
        return this.querySelector(selector) as ValueControl;
    }

    private setField(selector: string, value: string): void {
        const field = this.field(selector);
        field.setAttribute("value", value);
        field.value = value;
    }

    private modal(): Modal {
        return this.querySelector("[data-dialog]") as Modal;
    }
}

customElements.define("cms-dashboard-navigation-editor", DashboardNavigationEditor);

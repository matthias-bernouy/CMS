import { authoringContract, defaultManagedElement, type EditorCatalogueItem } from "./model";

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
        return Array.from(this.template.content.children).filter(
            (element): element is HTMLElement => element instanceof HTMLElement,
        );
    }

    add(item: EditorCatalogueItem): number {
        const contract = authoringContract(item);
        const tag = contract.root?.accepts?.[0];
        if (!tag) {
            throw new Error(`Bloc ${item.id} does not declare an authoring root`);
        }
        const element = document.createElement(tag);
        element.setAttribute("cms-bloc", item.id);
        for (const [name, value] of Object.entries(contract.root.defaults ?? {})) {
            element.setAttribute(name, value);
        }
        element.innerHTML = item.defaultContent;
        const managedElement = defaultManagedElement(contract);
        if (managedElement && !this.managedContent(element, managedElement.accepts ?? [])) {
            const contentTag = managedElement.accepts?.[0];
            if (!contentTag) {
                throw new Error(`Bloc ${item.id} does not declare an authoring content element`);
            }
            const content = document.createElement(contentTag);
            for (const [name, value] of Object.entries(managedElement.defaults ?? {})) {
                content.setAttribute(name, value);
            }
            element.append(content);
        }
        this.applyDefaults(element, item);
        this.template.content.append(element);
        return this.elements().length - 1;
    }

    remove(index: number): number {
        this.elements()[index]?.remove();
        return Math.min(index, this.elements().length - 1);
    }

    duplicate(index: number): number {
        const element = this.elements()[index];
        if (!element) {
            return index;
        }
        element.after(element.cloneNode(true));
        return index + 1;
    }

    move(index: number, offset: -1 | 1): number {
        const elements = this.elements();
        const element = elements[index];
        const target = elements[index + offset];
        if (!element || !target) {
            return index;
        }
        if (offset < 0) {
            target.before(element);
        } else {
            target.after(element);
        }
        return index + offset;
    }

    editableContent(index: number, item?: EditorCatalogueItem): string {
        const element = this.elements()[index];
        if (!element) {
            return "";
        }
        const managedElement = item && defaultManagedElement(authoringContract(item));
        return managedElement
            ? (this.managedContent(element, managedElement.accepts ?? [])?.innerHTML ?? "")
            : element.innerHTML;
    }

    updateContent(index: number, content: string, item?: EditorCatalogueItem): void {
        const element = this.elements()[index];
        if (!element) {
            return;
        }
        const managedElement = item && defaultManagedElement(authoringContract(item));
        const target = managedElement ? this.managedContent(element, managedElement.accepts ?? []) : element;
        if (target) {
            target.innerHTML = content;
        }
    }

    updateAttribute(index: number, name: string, value: string | boolean): void {
        const element = this.elements()[index];
        if (!element) {
            return;
        }
        if (typeof value === "boolean") {
            element.toggleAttribute(name, value);
        } else if (value === "") {
            element.removeAttribute(name);
        } else {
            element.setAttribute(name, value);
        }
    }

    private applyDefaults(element: HTMLElement, item: EditorCatalogueItem): void {
        for (const setting of authoringContract(item).settings ?? []) {
            if (setting.default === true) {
                element.setAttribute(setting.id, "");
            } else if (setting.default !== false && setting.default !== undefined) {
                element.setAttribute(setting.id, String(setting.default));
            }
        }
    }

    private managedContent(element: HTMLElement, acceptedTags: readonly string[]): HTMLElement | undefined {
        return Array.from(element.children).find(
            (child): child is HTMLElement =>
                child instanceof HTMLElement &&
                !child.hasAttribute("cms-bloc") &&
                acceptedTags.includes(child.localName),
        );
    }
}

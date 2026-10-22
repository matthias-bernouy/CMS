import { authoringContract, managedContent, type EditorCatalogueItem, type ManagedContent } from "./model";

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
        const managed = managedContent(contract);
        if (managed?.nativeElement && !this.managedContent(element, managed)) {
            const contentTag = managed.nativeElement.accepts?.[0];
            if (!contentTag) {
                throw new Error(`Bloc ${item.id} does not declare an authoring content element`);
            }
            const content = document.createElement(contentTag);
            if (managed.slot) {
                content.slot = managed.slot;
            }
            for (const [name, value] of Object.entries(managed.nativeElement.defaults ?? {})) {
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
        const managed = item && managedContent(authoringContract(item));
        if (!element || !managed) {
            return "";
        }
        return this.textTarget(element, managed)?.textContent ?? "";
    }

    updateContent(index: number, content: string, item?: EditorCatalogueItem): void {
        const element = this.elements()[index];
        const managed = item && managedContent(authoringContract(item));
        if (!element || !managed) {
            return;
        }
        const target = this.textTarget(element, managed);
        if (target) {
            target.textContent = content;
        }
    }

    isTextEditable(index: number, item?: EditorCatalogueItem): boolean {
        const element = this.elements()[index];
        const managed = item && managedContent(authoringContract(item));
        return Boolean(element && managed && this.textTarget(element, managed));
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

    private managedContent(element: HTMLElement, contract: ManagedContent): HTMLElement | undefined {
        if (!contract.slot && !contract.nativeElement) {
            return element;
        }
        const acceptedTags = contract.nativeElement?.accepts ?? [];
        return Array.from(element.children).find(
            (child): child is HTMLElement =>
                child instanceof HTMLElement &&
                !child.hasAttribute("cms-bloc") &&
                child.getAttribute("slot") === (contract.slot || null) &&
                (acceptedTags.length === 0 || acceptedTags.includes(child.localName)),
        );
    }

    private textTarget(element: HTMLElement, contract: ManagedContent): HTMLElement | undefined {
        const target = this.managedContent(element, contract);
        return target && target.children.length === 0 ? target : undefined;
    }
}

import { authoringContract, type EditorCatalogueItem } from "./model";

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
        const element = document.createElement(item.id);
        element.innerHTML = item.defaultContent;
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
        const nativeRoot = item && authoringContract(item).nativeElement ? element?.firstElementChild : undefined;
        return nativeRoot?.innerHTML ?? element?.innerHTML ?? "";
    }

    updateContent(index: number, content: string, item?: EditorCatalogueItem): void {
        const element = this.elements()[index];
        if (element) {
            const nativeRoot = item && authoringContract(item).nativeElement ? element.firstElementChild : undefined;
            if (nativeRoot) {
                nativeRoot.innerHTML = content;
            } else {
                element.innerHTML = content;
            }
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
}

export function catalogueItemFor(
    element: HTMLElement,
    catalogue: EditorCatalogueItem[],
): EditorCatalogueItem | undefined {
    return catalogue.find((item) => {
        const nativeTags = authoringContract(item).nativeElement?.accepts ?? [];
        return item.id === element.localName || nativeTags.includes(element.localName);
    });
}

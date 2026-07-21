import { clearBindingRuntimeState } from "@bernouy/cms-content/editor";
import { clearCompositionRuntimeState } from "@bernouy/components/base";

export function isEmptyDocumentContent(contentRoot: HTMLElement | null | undefined): boolean {
    if (!contentRoot) {
        return true;
    }

    const meaningfulNodes = Array.from(contentRoot.childNodes).filter(
        (node) => node.nodeType !== Node.TEXT_NODE || (node.textContent ?? "").trim() !== "",
    );
    if (meaningfulNodes.length === 0) {
        return true;
    }
    if (meaningfulNodes.length !== 1) {
        return false;
    }

    const node = meaningfulNodes[0];
    if (!node) {
        return true;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }
    const element = node as HTMLElement;
    if (element.tagName.toLowerCase() !== "p" || element.attributes.length > 0) {
        return false;
    }

    return Array.from(element.childNodes).every((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            return (child.textContent ?? "").trim() === "";
        }
        return child.nodeType === Node.ELEMENT_NODE && (child as Element).tagName.toLowerCase() === "br";
    });
}

export function contentHtml(frameDocument: Document | null): string {
    const content = frameDocument?.querySelector<HTMLElement>("[data-cms-content]");
    return serializableContentHtml(content);
}

export function serializableContentHtml(contentRoot: HTMLElement | null | undefined): string {
    const content = contentRoot?.cloneNode(true) as HTMLElement | undefined;

    if (!content) {
        return "";
    }

    clearCompositionRuntimeState(content);
    clearBindingRuntimeState(content);

    return content.innerHTML;
}

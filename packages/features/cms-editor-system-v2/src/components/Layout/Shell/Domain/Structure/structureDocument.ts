import { clearBindingRuntimeState } from "@bernouy/cms-content/editor";
import {
    COMPOSITION_AUTHORED_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    clearCompositionRuntimeState,
} from "@bernouy/components/base";
import { prepareNetworkInertBindings, restoreNetworkBindingMarkup } from "@bernouy/components/binding-dom";
import { stripInlineTextEditingState } from "../Settings/inlineTextEditing";

const COMPOSITION_CONTROLLER_RUNTIME_ATTRIBUTE = "data-p9r-composition-controller-runtime";
const COMPOSITION_SLOT_COMMENT_PREFIX = "p9r-composition-slot-";

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
    const content = cleanContentClone(contentRoot);
    if (!content) {
        return "";
    }
    restoreNetworkBindingMarkup(content);
    return content.innerHTML;
}

export function runtimeContentFragment(
    contentRoot: HTMLElement | null | undefined,
    targetDocument: Document,
): DocumentFragment {
    const content = runtimeContentClone(contentRoot);
    const template = targetDocument.createElement("template");
    if (!content) {
        return template.content;
    }
    prepareNetworkInertBindings(content);
    template.innerHTML = content.innerHTML;
    return template.content;
}

function cleanContentClone(contentRoot: HTMLElement | null | undefined): HTMLElement | null {
    const content = cloneContent(contentRoot);
    if (!content) {
        return null;
    }
    clearCompositionRuntimeState(content);
    clearEditorRuntimeState(content);
    return content;
}

function runtimeContentClone(contentRoot: HTMLElement | null | undefined): HTMLElement | null {
    const content = cloneContent(contentRoot);
    if (!content) {
        return null;
    }
    materializeCompositionOutputs(content);
    clearEditorRuntimeState(content);
    return content;
}

function cloneContent(contentRoot: HTMLElement | null | undefined): HTMLElement | null {
    return (contentRoot?.cloneNode(true) as HTMLElement | undefined) ?? null;
}

function clearEditorRuntimeState(content: HTMLElement): void {
    clearBindingRuntimeState(content);
    stripInlineTextEditingState(content);
}

function materializeCompositionOutputs(content: HTMLElement): void {
    const selector = `[${COMPOSITION_RUNTIME_ATTRIBUTE}]`;
    const compositions = Array.from(content.querySelectorAll<HTMLElement>(selector)).reverse();
    for (const composition of compositions) {
        const output = Array.from(composition.children).find((element) =>
            element.hasAttribute(COMPOSITION_OUTPUT_ATTRIBUTE),
        );
        if (!output) {
            clearCompositionRuntimeState(composition);
            continue;
        }

        const nodes = Array.from(output.childNodes);
        const forwardedSlot = composition.getAttribute("slot");
        if (forwardedSlot !== null) {
            for (const node of nodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    (node as Element).setAttribute("slot", forwardedSlot);
                }
            }
        }
        composition.replaceWith(...nodes);
    }

    for (const authored of Array.from(content.querySelectorAll(`[${COMPOSITION_AUTHORED_ATTRIBUTE}]`))) {
        authored.removeAttribute(COMPOSITION_AUTHORED_ATTRIBUTE);
    }
    for (const controller of Array.from(content.querySelectorAll(`[${COMPOSITION_CONTROLLER_RUNTIME_ATTRIBUTE}]`))) {
        controller.removeAttribute(COMPOSITION_CONTROLLER_RUNTIME_ATTRIBUTE);
    }
    removeCompositionRuntimeComments(content);
}

function removeCompositionRuntimeComments(root: Node): void {
    for (const child of Array.from(root.childNodes)) {
        if (child.nodeType === Node.COMMENT_NODE && child.nodeValue?.startsWith(COMPOSITION_SLOT_COMMENT_PREFIX)) {
            child.remove();
            continue;
        }
        removeCompositionRuntimeComments(child);
    }
}

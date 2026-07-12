export const COMPOSITION_RUNTIME_ATTRIBUTE = "data-p9r-composition";
export const COMPOSITION_INPUT_ATTRIBUTE = "data-p9r-composition-input";
export const COMPOSITION_OUTPUT_ATTRIBUTE = "data-p9r-composition-output";

const COMPOSITION_STYLE_ATTRIBUTE = "data-p9r-composition-style";

export function clearCompositionRuntimeState(root: ParentNode): void {
    while (true) {
        const compositions = compositionElements(root);
        if (compositions.length === 0) return;

        for (const composition of compositions.reverse()) {
            const input = compositionInput(composition);
            composition.removeAttribute(COMPOSITION_RUNTIME_ATTRIBUTE);
            if (input) composition.replaceChildren(input.content.cloneNode(true));
            else composition.replaceChildren();
        }
    }
}

export function compositionInput(host: Element): HTMLTemplateElement | null {
    const input = Array.from(host.children).find(element => (
        element.localName === "template"
        && element.hasAttribute(COMPOSITION_INPUT_ATTRIBUTE)
    ));
    return input as HTMLTemplateElement | undefined ?? null;
}

export function isCompositionRuntimeElement(element: Element): boolean {
    return element.hasAttribute(COMPOSITION_RUNTIME_ATTRIBUTE)
        && compositionInput(element) !== null;
}

export function ensureCompositionStyle(root: Node): void {
    const scope = styleScope(root);
    if (scope.querySelector(`style[${COMPOSITION_STYLE_ATTRIBUTE}]`)) return;

    const document = scope.nodeType === Node.DOCUMENT_NODE
        ? scope as Document
        : scope.ownerDocument!;
    const style = document.createElement("style");
    style.setAttribute(COMPOSITION_STYLE_ATTRIBUTE, "");
    const host = `[${COMPOSITION_RUNTIME_ATTRIBUTE}]`;
    style.textContent =
        `${host}{display:contents}` +
        `${host}>[${COMPOSITION_OUTPUT_ATTRIBUTE}]{display:contents}` +
        `${host}>:not([${COMPOSITION_OUTPUT_ATTRIBUTE}]):not(template[${COMPOSITION_INPUT_ATTRIBUTE}]){display:none!important}`;
    if (scope.nodeType === Node.DOCUMENT_NODE) {
        (document.head ?? document.documentElement).append(style);
    } else {
        scope.appendChild(style);
    }
}

function compositionElements(root: ParentNode): HTMLElement[] {
    const selector = `[${COMPOSITION_RUNTIME_ATTRIBUTE}]`;
    const elements = Array.from(root.querySelectorAll<HTMLElement>(selector))
        .filter(isCompositionRuntimeElement);
    if (
        root.nodeType === Node.ELEMENT_NODE
        && isCompositionRuntimeElement(root as Element)
    ) {
        elements.unshift(root as HTMLElement);
    }
    return elements;
}

function styleScope(root: Node): Document | ShadowRoot {
    const scope = root.getRootNode();
    return scope.nodeType === Node.DOCUMENT_NODE
        ? scope as Document
        : scope as ShadowRoot;
}

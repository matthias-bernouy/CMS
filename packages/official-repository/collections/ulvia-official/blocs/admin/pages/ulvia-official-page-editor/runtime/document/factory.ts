import { authoringContract, type EditorCatalogueItem, type EditorSlotAccept, normalizedSlotName } from "../model";

export function createBlocElement(item: EditorCatalogueItem): HTMLElement {
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
    createRequiredNativeContent(element, item);
    applySettingDefaults(element, item);
    return element;
}

function createRequiredNativeContent(element: HTMLElement, item: EditorCatalogueItem): void {
    const slots = Object.entries(authoringContract(item).slots ?? {});
    for (const [declaredName, slot] of slots) {
        const name = normalizedSlotName(declaredName);
        const native = slot.accepts?.find(
            (accept) => accept.kind === "native-element" || accept.kind === "native-content",
        );
        if (!native || hasSlotContent(element, name) || ((slot.min ?? 0) === 0 && slots.length > 1)) {
            continue;
        }
        if (!name && native.kind === "native-content") {
            continue;
        }
        element.append(createNativeContent(item, name, native));
    }
}

function createNativeContent(item: EditorCatalogueItem, slot: string, accept: EditorSlotAccept): HTMLElement {
    const tag = accept.kind === "native-element" ? accept.accepts?.[0] : accept.profile === "prose" ? "p" : "span";
    if (!tag) {
        throw new Error(`Bloc ${item.id} does not declare an authoring content element`);
    }
    const content = document.createElement(tag);
    if (slot) {
        content.slot = slot;
    }
    for (const [name, value] of Object.entries(accept.defaults ?? {})) {
        content.setAttribute(name, value);
    }
    return content;
}

function applySettingDefaults(element: HTMLElement, item: EditorCatalogueItem): void {
    for (const setting of authoringContract(item).settings ?? []) {
        if (setting.default === true) {
            element.setAttribute(setting.id, "");
        } else if (setting.default !== false && setting.default !== undefined) {
            element.setAttribute(setting.id, String(setting.default));
        }
    }
}

function hasSlotContent(element: HTMLElement, slot: string): boolean {
    return Array.from(element.childNodes).some((child) => {
        if (child instanceof HTMLElement) {
            return (child.getAttribute("slot") ?? "") === slot;
        }
        return !slot && child.textContent?.trim();
    });
}

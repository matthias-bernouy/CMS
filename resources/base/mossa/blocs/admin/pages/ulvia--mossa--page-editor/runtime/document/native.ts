import {
    authoringContract,
    displayLabel,
    type EditorCatalogueItem,
    type EditorNativeElement,
    normalizedSlotName,
} from "../model";

const BOOLEAN_ATTRIBUTES = new Set([
    "checked",
    "default",
    "disabled",
    "hidden",
    "inert",
    "multiple",
    "readonly",
    "required",
    "selected",
]);

export type EditableNativeAttribute = Readonly<{
    kind: "boolean" | "string";
    name: string;
    required: boolean;
    value: boolean | string;
    values: readonly string[];
}>;

export type EditableNativeElement = Readonly<{
    attributes: readonly EditableNativeAttribute[];
    label: string;
    slot: string;
    tag: string;
    tags: readonly string[];
}>;

export function nativeElementFields(element: HTMLElement, item?: EditorCatalogueItem): EditableNativeElement[] {
    if (!item) {
        return [];
    }
    const fields: EditableNativeElement[] = [];
    for (const [declaredName, slot] of Object.entries(authoringContract(item).slots ?? {})) {
        const contract = slot.accepts?.find(({ kind }) => kind === "native-element");
        const name = normalizedSlotName(declaredName);
        const target = contract ? nativeElementTarget(element, name) : undefined;
        if (!contract || !target) {
            continue;
        }
        fields.push({
            attributes: nativeAttributes(target, contract),
            label: displayLabel(name || "element"),
            slot: name,
            tag: target.localName,
            tags: contract.accepts ?? [],
        });
    }
    return fields;
}

export function nativeElementTarget(element: HTMLElement, slot: string): HTMLElement | undefined {
    return Array.from(element.children).find(
        (child): child is HTMLElement =>
            child instanceof HTMLElement &&
            !child.hasAttribute("cms-bloc") &&
            (child.getAttribute("slot") ?? "") === slot,
    );
}

export function updateNativeElementAttribute(
    element: HTMLElement,
    slot: string,
    name: string,
    value: string | boolean,
): void {
    const target = nativeElementTarget(element, slot);
    if (!target) {
        return;
    }
    if (typeof value === "boolean") {
        target.toggleAttribute(name, value);
    } else if (value === "") {
        target.removeAttribute(name);
    } else {
        target.setAttribute(name, value);
    }
}

function nativeAttributes(element: HTMLElement, contract: EditorNativeElement): EditableNativeAttribute[] {
    const names = new Set([...Object.keys(contract.attributes ?? {}), ...Object.keys(contract.defaults ?? {})]);
    return Array.from(names, (name) => {
        const definition = contract.attributes?.[name];
        const boolean = BOOLEAN_ATTRIBUTES.has(name) || definition?.values?.every((value) => value === "");
        return {
            kind: boolean ? "boolean" : "string",
            name,
            required: definition?.required === true,
            value: boolean ? element.hasAttribute(name) : (element.getAttribute(name) ?? ""),
            values: definition?.values ?? [],
        } satisfies EditableNativeAttribute;
    }).filter(({ required, values }) => !required || values.length !== 1);
}

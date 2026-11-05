import { authoringContract, displayLabel, type EditorCatalogueItem, normalizedSlotName } from "../model";
import { nativeElementTarget } from "./native";

const INERT_TEXT_ANCESTORS = new Set(["script", "style", "svg", "template"]);
const TEXT_NATIVE_ELEMENTS = new Set([
    "figcaption",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "label",
    "legend",
    "option",
    "p",
    "span",
    "summary",
]);
type EditableContentTarget = Text | Element;

export type EditableContentField = Readonly<{
    address: string;
    label: string;
    position: number;
    profile: "phrasing" | "inline" | "prose";
    slot: string;
    value: string;
}>;

export function contentFields(element: HTMLElement, item?: EditorCatalogueItem): EditableContentField[] {
    if (!item) {
        return [];
    }
    const fields: EditableContentField[] = [];
    for (const [declaredName, slot] of Object.entries(authoringContract(item).slots ?? {})) {
        const content = slot.accepts?.find(({ kind }) => kind === "native-content");
        const native = slot.accepts?.find(({ kind }) => kind === "native-element");
        const name = normalizedSlotName(declaredName);
        const nativeTarget = native ? nativeElementTarget(element, name) : undefined;
        const roots = content
            ? contentRoots(element, name)
            : nativeTarget && TEXT_NATIVE_ELEMENTS.has(nativeTarget.localName)
              ? [nativeTarget]
              : [];
        if (roots.length === 0) {
            continue;
        }
        const targets = editableContentTargets(roots, element, name);
        targets.forEach((target, position) => {
            fields.push({
                address: nodeAddress(element, target),
                label: fieldLabel(name, position, targets.length),
                position,
                profile: content?.profile ?? "inline",
                slot: name,
                value: target.textContent?.trim() ?? "",
            });
        });
    }
    return fields;
}

export function updateContentField(element: HTMLElement, address: string, content: string): void {
    const target = nodeAt(element, address);
    if (target?.nodeType === 3 || (target?.nodeType === 1 && (target as Element).childElementCount === 0)) {
        target.textContent = content;
    }
}

export function editableContentTargets(roots: readonly Element[], owner: Element, slot = ""): EditableContentTarget[] {
    const targets: EditableContentTarget[] = [];
    for (const root of roots) {
        visit(root, owner, slot, targets);
    }
    return targets;
}

function visit(node: Node, owner: Element, slot: string, targets: EditableContentTarget[]): void {
    if (node.nodeType === 3) {
        if (node.textContent?.trim()) {
            targets.push(node as Text);
        }
        return;
    }
    if (node.nodeType !== 1) {
        return;
    }
    const element = node as Element;
    if (element !== owner && element.hasAttribute("slot") && element.getAttribute("slot") !== slot) {
        return;
    }
    if (element !== owner && (element.hasAttribute("cms-bloc") || INERT_TEXT_ANCESTORS.has(element.localName))) {
        return;
    }
    const initialTargetCount = targets.length;
    for (const child of Array.from(element.childNodes)) {
        visit(child, owner, slot, targets);
    }
    if (targets.length === initialTargetCount && element.childElementCount === 0 && !element.textContent?.trim()) {
        targets.push(element);
    }
}

function contentRoots(element: HTMLElement, slot: string): Element[] {
    if (!slot) {
        return [element];
    }
    return Array.from(element.children).filter(
        (child) => !child.hasAttribute("cms-bloc") && child.getAttribute("slot") === slot,
    );
}

function fieldLabel(slot: string, position: number, count: number): string {
    const label = displayLabel(slot || "content");
    return count > 1 ? `${label} ${position + 1}` : label;
}

function nodeAddress(root: Node, target: Node): string {
    const path: number[] = [];
    let current: Node | null = target;
    while (current && current !== root) {
        const parent: Node | null = current.parentNode;
        if (!parent) {
            return "";
        }
        path.unshift(Array.from(parent.childNodes).indexOf(current));
        current = parent;
    }
    return path.join(".");
}

function nodeAt(root: Node, address: string): Node | null {
    let current: Node | null = root;
    for (const part of address.split(".")) {
        const index = Number(part);
        if (!current || !Number.isInteger(index) || index < 0) {
            return null;
        }
        current = current.childNodes.item(index);
    }
    return current;
}

import {
    isPlatformNativeEditorTag,
    isSafeNavigationalUrl,
    type ContentSlot,
    type Editor,
} from "@bernouy/cms-content/editor";

const NATIVE_RICH_TEXT_TARGETS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "span", "li"]);
const ALLOWED_INLINE_TAGS = new Set(["strong", "em", "code"]);
const DANGEROUS_TAGS = new Set([
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
    "object",
    "embed",
    "svg",
    "math",
    "img",
    "video",
    "audio",
    "source",
    "track",
]);

export function sanitizeNativeRichTextFragment(root: ParentNode, targetTag: string): void {
    const normalizedTarget = targetTag.toLowerCase();
    if (!NATIVE_RICH_TEXT_TARGETS.has(normalizedTarget)) {
        return;
    }
    sanitizeChildren(root, normalizedTarget !== "a");
}

export function sanitizeNativeRichTextEditor(editor: Editor): void {
    const targetTag = editor.target.localName;
    if (!isPlatformNativeEditorTag(targetTag) || editor.getTextCapability()?.format !== "richtext") {
        return;
    }

    const reserved = reservedSlotNames(editor.getContentSlots());
    for (const node of Array.from(editor.target.childNodes)) {
        if (!isReservedSlotNode(node, reserved)) {
            sanitizeNode(node, targetTag !== "a");
        }
    }
}

function sanitizeChildren(parent: ParentNode, allowLinks: boolean): void {
    for (const node of Array.from(parent.childNodes)) {
        sanitizeNode(node, allowLinks);
    }
}

function sanitizeNode(node: ChildNode, allowLinks: boolean): void {
    if (node.nodeType === 3) {
        return;
    }
    if (node.nodeType !== 1) {
        node.remove();
        return;
    }

    const element = node as HTMLElement;
    const tag = element.localName;
    if (DANGEROUS_TAGS.has(tag)) {
        element.remove();
        return;
    }

    sanitizeChildren(element, allowLinks);
    if (ALLOWED_INLINE_TAGS.has(tag)) {
        removeAttributes(element);
        return;
    }
    if (tag === "a" && allowLinks) {
        const href = element.getAttribute("href")?.trim() ?? "";
        if (href && isSafeNavigationalUrl(href)) {
            removeAttributes(element);
            element.setAttribute("href", href);
            return;
        }
    }
    element.replaceWith(...Array.from(element.childNodes));
}

function removeAttributes(element: Element): void {
    for (const attribute of Array.from(element.attributes)) {
        element.removeAttribute(attribute.name);
    }
}

function reservedSlotNames(slots: ContentSlot[]): Set<string> {
    return new Set(slots.flatMap((slot) => (slot.slot ? [slot.slot] : [])));
}

function isReservedSlotNode(node: ChildNode, reserved: Set<string>): boolean {
    return node.nodeType === 1 && reserved.has((node as Element).getAttribute("slot") ?? "");
}

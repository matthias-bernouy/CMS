import {
    ContentValidationError,
    hardenStoredHtml,
    isSiteBlocNativeStructureTag,
    type SiteBlocSlot,
} from "@bernouy/cms-content";
import type { MediaAccept } from "@bernouy/cms-content/editor";
import { parseHTML } from "linkedom";

export function validateSiteBlocSlotAccepts(
    slots: SiteBlocSlot[],
    registeredTags: Set<string>,
    archivedTags: Set<string> = new Set(),
): void {
    for (const slot of slots) {
        for (const accept of slot.accepts) {
            if (accept.kind === "component" && archivedTags.has(accept.tag)) {
                throw new ContentValidationError(`draft.slots.${slot.id}.accepts`, `bloc "${accept.tag}" is archived`);
            }
            if (
                accept.kind === "component" &&
                !registeredTags.has(accept.tag) &&
                !isSiteBlocNativeStructureTag(accept.tag)
            ) {
                throw new ContentValidationError(
                    `draft.slots.${slot.id}.accepts`,
                    `bloc "${accept.tag}" is not published`,
                );
            }
        }
    }
}

export function validateSiteBlocDefaultContent(
    html: string,
    slots: SiteBlocSlot[],
    registeredTags: Set<string>,
): string {
    const hardened = hardenStoredHtml(html);
    const { document } = parseHTML("<!DOCTYPE html><html><body></body></html>");
    document.body.innerHTML = hardened;
    const byName = new Map(slots.map((slot) => [slot.slot ?? "", slot]));
    const counts = new Map(slots.map((slot) => [slot.id, 0]));

    for (const [index, node] of Array.from(document.body.childNodes).entries()) {
        if (node.nodeType === node.TEXT_NODE) {
            if ((node.textContent ?? "").trim()) {
                throw new ContentValidationError(`defaultContent.${index}`, "top-level text is not a slot item");
            }
            continue;
        }
        if (node.nodeType !== node.ELEMENT_NODE) {
            continue;
        }
        const element = node as Element;
        const slotName = element.getAttribute("slot")?.trim() ?? "";
        const slot = byName.get(slotName);
        if (!slot) {
            throw new ContentValidationError(
                `defaultContent.${index}`,
                slotName ? `unknown slot "${slotName}"` : "no default slot is declared",
            );
        }
        if (!acceptsElement(slot, element, registeredTags)) {
            throw new ContentValidationError(
                `defaultContent.${index}`,
                `element <${element.localName}> is not accepted by slot "${slot.label}"`,
            );
        }
        counts.set(slot.id, (counts.get(slot.id) ?? 0) + 1);
    }

    for (const slot of slots) {
        const count = counts.get(slot.id) ?? 0;
        if (slot.min !== undefined && count < slot.min) {
            throw new ContentValidationError(
                "defaultContent",
                `slot "${slot.label}" requires at least ${slot.min} item(s)`,
            );
        }
        if (slot.max !== undefined && count > slot.max) {
            throw new ContentValidationError(
                "defaultContent",
                `slot "${slot.label}" accepts at most ${slot.max} item(s)`,
            );
        }
    }
    return hardened;
}

function acceptsElement(slot: SiteBlocSlot, element: Element, registeredTags: Set<string>): boolean {
    const tag = element.localName.toLowerCase();
    if (!isContextualNativeSlotItemAllowed(slot, tag)) {
        return false;
    }
    return slot.accepts.some((accept) => {
        if (accept.kind === "component") {
            return accept.tag.toLowerCase() === tag && (registeredTags.has(tag) || isSiteBlocNativeStructureTag(tag));
        }
        if (accept.kind === "any-component") {
            return registeredTags.has(tag) || isSiteBlocNativeStructureTag(tag);
        }
        const types = accept.accept ?? ["image"];
        return types.some((type) => mediaTag(type, tag));
    });
}

function isContextualNativeSlotItemAllowed(slot: SiteBlocSlot, tag: string): boolean {
    if (tag === "span") {
        return slot.accepts.some((accept) => accept.kind === "component" && accept.tag.toLowerCase() === "span");
    }
    return tag !== "li" && tag !== "strong" && tag !== "em" && tag !== "code";
}

function mediaTag(type: MediaAccept, tag: string): boolean {
    if (type === "image" || type === "bitmap") {
        return tag === "img" || tag === "picture";
    }
    if (type === "svg") {
        return tag === "svg";
    }
    if (type === "video" || type === "audio") {
        return tag === type;
    }
    return tag === "a" || tag === "object" || tag === "embed";
}

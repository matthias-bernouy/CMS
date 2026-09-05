import type {
    ContentSlot,
    ContentSlotAccept,
    EditorCatalog,
    EditorCatalogEntry,
    MediaAccept,
} from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../components/Layout/Pickers/BlockPickerModal/BlockPickerModal";
import { isEditorPlacementAllowed } from "./editorPlacement";

const ROOT_MEDIA_ACCEPT = new Set<MediaAccept>(["image", "bitmap", "svg"]);

export function acceptsEntry(accept: ContentSlotAccept, entry: EditorCatalogEntry): boolean {
    if (accept.kind === "media") {
        return false;
    }
    if (accept.kind === "any-component") {
        return true;
    }
    return accept.tag.toLowerCase() === entry.tag.toLowerCase();
}

export function acceptsItem(accept: ContentSlotAccept, item: BlockPickerItem): boolean {
    if (item.kind === "media") {
        return accept.kind === "media";
    }
    return acceptsEntry(accept, item.entry);
}

export function acceptsCatalogEntry(slot: ContentSlot, entry: EditorCatalogEntry, parentTag: string): boolean {
    return (
        isEditorPlacementAllowed(entry, { kind: "slot", parentTag, slot }) &&
        slot.accepts.some((accept) => acceptsEntry(accept, entry))
    );
}

export function acceptsElementForParent(
    slot: ContentSlot,
    element: HTMLElement,
    catalog: EditorCatalog,
    parentTag: string | undefined,
): boolean {
    const tag = element.localName.toLowerCase();
    const entry = editorCatalogEntryForElement(element, catalog);
    if (entry && parentTag && !isEditorPlacementAllowed(entry, { kind: "slot", parentTag, slot })) {
        return false;
    }
    return slot.accepts.some((accept) => {
        if (accept.kind === "component") {
            return accept.tag.toLowerCase() === tag;
        }
        if (accept.kind === "any-component") {
            return entry !== undefined || mediaTag("image", tag);
        }
        return (accept.accept ?? ["image"]).some((type) => mediaTag(type, tag));
    });
}

export function isElementPlacementAllowedAtRoot(element: HTMLElement, catalog: EditorCatalog): boolean {
    const entry = editorCatalogEntryForElement(element, catalog);
    return entry !== undefined && isEditorPlacementAllowed(entry, { kind: "root" });
}

export function mediaElementMatchesAccept(element: HTMLElement, accept: readonly MediaAccept[]): boolean {
    const tag = element.localName.toLowerCase();
    return accept.some((type) => mediaTag(type, tag));
}

export function mediaAcceptForSlot(slot: ContentSlot): MediaAccept[] | null {
    const explicit = slot.accepts.find((accept) => accept.kind === "media");
    if (explicit?.kind === "media") {
        return explicit.accept ?? ["image"];
    }
    if (slot.accepts.some((accept) => accept.kind === "component" && accept.tag.toLowerCase() === "img")) {
        return ["image"];
    }
    if (slot.accepts.some((accept) => accept.kind === "component" && accept.tag.toLowerCase() === "svg")) {
        return ["svg"];
    }
    return slot.accepts.some((accept) => accept.kind === "any-component") ? ["bitmap", "svg"] : null;
}

export function mediaAcceptForRootItem(item: Extract<BlockPickerItem, { kind: "media" }>): MediaAccept[] | null {
    const requested = requestedMediaAccept(item);
    const accepted = requested.filter((type) => ROOT_MEDIA_ACCEPT.has(type));
    return accepted.length > 0 ? [...new Set(accepted)] : null;
}

export function mediaAcceptForSlotItem(
    slot: ContentSlot,
    item: Extract<BlockPickerItem, { kind: "media" }>,
): MediaAccept[] | null {
    const allowed = mediaAcceptForSlot(slot);
    if (!allowed) {
        return null;
    }
    const requested = requestedMediaAccept(item);
    const accepted = allowed.filter((allowedType) =>
        requested.some((requestedType) => mediaAcceptOverlaps(allowedType, requestedType)),
    );
    return accepted.length > 0 ? [...new Set(accepted)] : null;
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

function requestedMediaAccept(item: Extract<BlockPickerItem, { kind: "media" }>): MediaAccept[] {
    return item.accept?.length ? item.accept : ["image"];
}

function mediaAcceptOverlaps(left: MediaAccept, right: MediaAccept): boolean {
    if (left === right) {
        return true;
    }
    return left === "image"
        ? right === "bitmap" || right === "svg"
        : right === "image" && (left === "bitmap" || left === "svg");
}

function editorCatalogEntryForElement(element: HTMLElement, catalog: EditorCatalog): EditorCatalogEntry | undefined {
    const tag = element.localName.toLowerCase();
    return catalog.find((candidate) => candidate.tag.toLowerCase() === tag);
}

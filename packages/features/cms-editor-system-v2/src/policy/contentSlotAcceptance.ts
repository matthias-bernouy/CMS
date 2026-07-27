import type {
    ContentSlot,
    ContentSlotAccept,
    EditorCatalog,
    EditorCatalogEntry,
    MediaAccept,
} from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../components/Layout/Pickers/BlockPickerModal/BlockPickerModal";

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
    if (item.kind === "block") {
        return acceptsEntry(accept, item.entry);
    }
    if (accept.kind === "media") {
        return false;
    }
    return accept.kind === "any-component";
}

export function acceptsElement(slot: ContentSlot, element: HTMLElement, catalog: EditorCatalog): boolean {
    const tag = element.localName.toLowerCase();
    const entry = catalog.find((candidate) => candidate.tag.toLowerCase() === tag);
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

export function mediaAcceptForSlot(slot: ContentSlot): MediaAccept[] | null {
    const explicit = slot.accepts.find((accept) => accept.kind === "media");
    if (explicit?.kind === "media") {
        return explicit.accept ?? ["image"];
    }
    if (slot.accepts.some((accept) => accept.kind === "component" && accept.tag.toLowerCase() === "img")) {
        return ["image"];
    }
    return slot.accepts.some((accept) => accept.kind === "any-component") ? ["image"] : null;
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

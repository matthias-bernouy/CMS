import type { ContentSlot, EditorCatalogEntry } from "@bernouy/cms-content/editor";

export type EditorPlacementContext = { kind: "root" } | { kind: "slot"; parentTag: string; slot: ContentSlot };

export function isEditorPlacementAllowed(entry: EditorCatalogEntry, context: EditorPlacementContext): boolean {
    const placement = entry.placement;
    if (!placement || placement.kind === "anywhere") {
        return true;
    }
    if (context.kind === "root") {
        return false;
    }
    if (placement.kind === "parent-tags") {
        return placement.tags.some((tag) => tag.toLowerCase() === context.parentTag.toLowerCase());
    }
    return context.slot.accepts.some(
        (accept) => accept.kind === "component" && accept.tag.toLowerCase() === entry.tag.toLowerCase(),
    );
}

export type ContentSlotAccept =
    | { kind: "component"; tag: string }
    | { kind: "any-component" }
    | { kind: "media"; accept?: MediaAccept[] };

export type MediaAccept =
    | "image"
    | "bitmap"
    | "svg"
    | "video"
    | "audio"
    | "document";

export type ContentSlot = {
    /**
     * Human-readable slot name shown by editor UIs.
     */
    label: string;
    /**
     * Public light-DOM slot name. Omit for the default slot / direct content
     * of the edited element.
     */
    slot?: string;
    /**
     * Minimum accepted items in this content slot.
     */
    min?: number;
    /**
     * Maximum accepted items in this content slot.
     */
    max?: number;
    /**
     * Accepted component kinds for this light-DOM slot.
     */
    accepts: ContentSlotAccept[];
};

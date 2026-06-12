export type ContentSlotAccept =
    | { kind: "text" }
    | { kind: "richtext" }
    | { kind: "component"; tag: string }
    | { kind: "any-component" };

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
     * Accepted content kinds. Text/richtext are reserved text-node contracts;
     * component entries target registered custom/native tags.
     */
    accepts: ContentSlotAccept[];
};

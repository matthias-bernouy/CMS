import { authoringContract, type EditorCatalogueItem, type EditorSlot, normalizedSlotName } from "../model";

export function slotDefinition(item: EditorCatalogueItem | undefined, name: string): EditorSlot | undefined {
    const slots = item ? authoringContract(item).slots : undefined;
    return slots?.[name] ?? (name === "" ? slots?.default : undefined);
}

export function acceptsItem(slot: EditorSlot, item: EditorCatalogueItem): boolean {
    return Boolean(
        slot.accepts?.some(
            (accept) =>
                (accept.kind === "any-component" && item.kind === "component") ||
                (accept.kind === "component" && accept.tag === item.id),
        ),
    );
}

export function componentSlots(item: EditorCatalogueItem): Array<readonly [string, EditorSlot]> {
    return Object.entries(authoringContract(item).slots ?? {})
        .filter(([, slot]) => slot.accepts?.some(({ kind }) => kind === "component" || kind === "any-component"))
        .map(([name, slot]) => [normalizedSlotName(name), slot] as const);
}

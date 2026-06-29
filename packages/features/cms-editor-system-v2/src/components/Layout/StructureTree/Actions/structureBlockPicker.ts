import type {
    BlockPickerItem,
    BlockPickerOption,
    BlockPickerSlotGroup,
} from "../../BlockPickerModal/BlockPickerModal";
import type {
    PendingPickerAction,
    StructureTreeAction,
} from "../State/structureTreeTypes";

export type StructureBlockPickerContext = {
    emitAction(action: StructureTreeAction, item?: BlockPickerItem, slot?: string): void;
    openBlockPicker(groups: BlockPickerSlotGroup[], contextLabel: string): void;
    setPendingPickerAction(action: PendingPickerAction): void;
};

export function openPickerOrEmitSingleMedia(
    action: PendingPickerAction,
    groups: BlockPickerSlotGroup[],
    contextLabel: string,
    context: StructureBlockPickerContext,
): void {
    const option = singleEnabledOption(groups);
    if (option?.item?.kind === "media") {
        context.emitAction(action.action, option.item, option.slot);
        return;
    }

    context.setPendingPickerAction(action);
    context.openBlockPicker(groups, contextLabel);
}

export function singleEnabledOption(groups: BlockPickerSlotGroup[]): BlockPickerOption | null {
    const options = groups
        .filter(group => !group.disabledReason)
        .flatMap(group => group.options);

    return options.length === 1 ? options[0] ?? null : null;
}

export function useDefaultTemplate(
    templates: BlockPickerItem[],
    groups: BlockPickerSlotGroup[],
    context: StructureBlockPickerContext,
): boolean {
    if (templates.length === 0) return false;
    if (templates.length === 1) {
        context.emitAction("add-root", templates[0]);
        return true;
    }
    context.setPendingPickerAction({ action: "add-root" });
    context.openBlockPicker(groups, "Page");
    return true;
}

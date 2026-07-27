import type { ResolvedEditorInteractionPolicy } from "../../../../policy/editorInteractionPolicy";
import type { BlockPickerSlotGroup } from "../../Pickers/BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode, StructureNode } from "../../../../runtime";
import { contextMenuButton, contextSeparator, positionContextMenu } from "./structureContextMenuItems";
import {
    dynamicContextMenuItems,
    moveContextMenuItems,
    openChildPicker,
    openReplacePicker,
} from "./structureContextMenuSections";

type PendingPickerAction = {
    action: "add-child" | "add-root" | "replace";
    editor?: EditorStructureNode["editor"];
};

export type StructureContextMenuContext = {
    appendMenu(menu: HTMLElement): void;
    canDelete(node: EditorStructureNode): boolean;
    canDuplicate(node: EditorStructureNode): boolean;
    childGroups(node: EditorStructureNode): BlockPickerSlotGroup[];
    closeContextMenu(): void;
    editingPolicy: ResolvedEditorInteractionPolicy;
    emitAction(
        action:
            | "copy"
            | "paste-after"
            | "duplicate"
            | "delete"
            | "remove-repeat"
            | "configure-repeat"
            | "remove-source-status-condition",
        editor?: EditorStructureNode["editor"],
    ): void;
    hasEnabledGroup(groups: BlockPickerSlotGroup[]): boolean;
    moveNode(source: EditorStructureNode, target: EditorStructureNode, position: "before" | "after"): void;
    openPickerOrEmitSingleMedia(
        action: PendingPickerAction,
        groups: BlockPickerSlotGroup[],
        contextLabel: string,
    ): void;
    openConditionPicker(node: EditorStructureNode): void;
    openRootPicker(): void;
    openSourcePicker(node: EditorStructureNode): void;
    repeatableTargets: WeakSet<HTMLElement>;
    replaceGroups(node: EditorStructureNode): BlockPickerSlotGroup[];
    requestFocusRestore(): void;
    rootGroups(): BlockPickerSlotGroup[];
    sourceActionLabel(node: EditorStructureNode): string;
    sourceDataSourceCount(): number;
    sibling(node: EditorStructureNode, offset: -1 | 1): EditorStructureNode | null;
};

export function openStructureContextMenu(
    node: StructureNode,
    clientX: number,
    clientY: number,
    menu: HTMLElement,
    context: StructureContextMenuContext,
    focusMenu = false,
): void {
    context.closeContextMenu();
    menu.replaceChildren(
        contextMenuButton(
            "Add child",
            () => openChildPicker(node, context),
            context.closeContextMenu,
            undefined,
            !context.hasEnabledGroup(context.childGroups(node)),
        ),
        contextMenuButton("Copy", () => context.emitAction("copy", node.editor), context.closeContextMenu),
        contextMenuButton(
            "Paste after",
            () => context.emitAction("paste-after", node.editor),
            context.closeContextMenu,
        ),
        contextMenuButton(
            "Duplicate",
            () => context.emitAction("duplicate", node.editor),
            context.closeContextMenu,
            undefined,
            !context.canDuplicate(node),
        ),
        ...moveContextMenuItems(node, context),
    );

    const bindingItems = dynamicContextMenuItems(node, context);
    if (bindingItems.length > 0) {
        menu.append(contextSeparator(), ...bindingItems);
    }
    menu.append(
        contextSeparator(),
        contextMenuButton(
            "Replace",
            () => openReplacePicker(node, context),
            context.closeContextMenu,
            undefined,
            !context.hasEnabledGroup(context.replaceGroups(node)),
        ),
        contextMenuButton(
            "Delete",
            () => context.emitAction("delete", node.editor),
            context.closeContextMenu,
            "danger",
            !context.canDelete(node),
        ),
    );
    appendPositionedMenu(menu, clientX, clientY, context);
    if (focusMenu) {
        menu.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    }
}

export function openRootContextMenu(
    clientX: number,
    clientY: number,
    menu: HTMLElement,
    context: StructureContextMenuContext,
): void {
    context.closeContextMenu();
    menu.replaceChildren(
        contextMenuButton(
            "Add block",
            () => context.openRootPicker(),
            context.closeContextMenu,
            undefined,
            !context.hasEnabledGroup(context.rootGroups()),
        ),
        contextMenuButton("Paste", () => context.emitAction("paste-after"), context.closeContextMenu),
    );
    appendPositionedMenu(menu, clientX, clientY, context);
}

function appendPositionedMenu(
    menu: HTMLElement,
    clientX: number,
    clientY: number,
    context: StructureContextMenuContext,
): void {
    context.appendMenu(menu);
    positionContextMenu(menu, clientX, clientY);
}

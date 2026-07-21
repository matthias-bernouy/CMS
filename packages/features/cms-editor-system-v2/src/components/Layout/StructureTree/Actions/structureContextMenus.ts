import { CMS_BINDING_ATTRIBUTES } from "@bernouy/cms-content/editor";
import type { BlockPickerSlotGroup } from "../../BlockPickerModal/BlockPickerModal";
import type { EditorStructureNode, StructureNode } from "../../../../runtime";
import { contextMenuButton, contextSeparator, positionContextMenu } from "./structureContextMenuItems";

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
    rootGroups(): BlockPickerSlotGroup[];
    sourceActionLabel(node: EditorStructureNode): string;
    sourceDataSourceCount(): number;
};

export function openStructureContextMenu(
    node: StructureNode,
    clientX: number,
    clientY: number,
    menu: HTMLElement,
    context: StructureContextMenuContext,
): void {
    context.closeContextMenu();

    menu.replaceChildren();
    const sourceAction = contextMenuButton(
        context.sourceActionLabel(node),
        () => {
            context.openSourcePicker(node);
        },
        context.closeContextMenu,
        undefined,
        context.sourceDataSourceCount() === 0,
    );
    const repeatAction = node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)
        ? contextMenuButton(
              "Remove repeat",
              () => context.emitAction("remove-repeat", node.editor),
              context.closeContextMenu,
          )
        : contextMenuButton(
              "Add repeat",
              () => context.emitAction("configure-repeat", node.editor),
              context.closeContextMenu,
              undefined,
              !context.repeatableTargets.has(node.target),
          );

    menu.append(
        contextMenuButton(
            "Add child",
            () => {
                context.openPickerOrEmitSingleMedia(
                    { action: "add-child", editor: node.editor },
                    context.childGroups(node),
                    node.label,
                );
            },
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
        contextSeparator(),
        sourceAction,
        repeatAction,
        contextMenuButton("Add condition", () => context.openConditionPicker(node), context.closeContextMenu),
        contextSeparator(),
        contextMenuButton(
            "Replace",
            () => {
                context.openPickerOrEmitSingleMedia(
                    { action: "replace", editor: node.editor },
                    context.replaceGroups(node),
                    node.label,
                );
            },
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

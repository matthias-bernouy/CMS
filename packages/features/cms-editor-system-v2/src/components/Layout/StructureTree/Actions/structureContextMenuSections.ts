import { CMS_BINDING_ATTRIBUTES } from "@bernouy/cms-content/editor";
import type { EditorStructureNode } from "../../../../runtime";
import { contextMenuButton } from "./structureContextMenuItems";
import type { StructureContextMenuContext } from "./structureContextMenus";

export function dynamicContextMenuItems(
    node: EditorStructureNode,
    context: StructureContextMenuContext,
): HTMLElement[] {
    const policy = context.editingPolicy;
    if (!policy.bindings) {
        return [];
    }
    const items: HTMLElement[] = [
        contextMenuButton(
            context.sourceActionLabel(node),
            () => context.openSourcePicker(node),
            context.closeContextMenu,
            undefined,
            context.sourceDataSourceCount() === 0,
        ),
    ];
    if (policy.repeats) {
        items.push(repeatItem(node, context));
    }
    if (policy.conditions) {
        items.push(
            contextMenuButton("Add condition", () => context.openConditionPicker(node), context.closeContextMenu),
        );
    }
    return items;
}

export function moveContextMenuItems(
    node: EditorStructureNode,
    context: StructureContextMenuContext,
): HTMLButtonElement[] {
    const previous = context.sibling(node, -1);
    const next = context.sibling(node, 1);
    return [
        contextMenuButton(
            "Move up",
            () => moveNode(node, previous, "before", context),
            context.closeContextMenu,
            undefined,
            !previous,
        ),
        contextMenuButton(
            "Move down",
            () => moveNode(node, next, "after", context),
            context.closeContextMenu,
            undefined,
            !next,
        ),
    ];
}

export function openChildPicker(node: EditorStructureNode, context: StructureContextMenuContext): void {
    context.openPickerOrEmitSingleMedia(
        { action: "add-child", editor: node.editor },
        context.childGroups(node),
        node.label,
    );
}

export function openReplacePicker(node: EditorStructureNode, context: StructureContextMenuContext): void {
    context.openPickerOrEmitSingleMedia(
        { action: "replace", editor: node.editor },
        context.replaceGroups(node),
        node.label,
    );
}

function repeatItem(node: EditorStructureNode, context: StructureContextMenuContext): HTMLButtonElement {
    return node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)
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
}

function moveNode(
    source: EditorStructureNode,
    target: EditorStructureNode | null,
    position: "before" | "after",
    context: StructureContextMenuContext,
): void {
    if (!target) {
        return;
    }
    context.requestFocusRestore();
    context.moveNode(source, target, position);
}

import { CMS_BINDING_ATTRIBUTES } from "@bernouy/cms-content/editor";
import type { BlockPickerSlotGroup } from "../../BlockPickerModal/BlockPickerModal";
import type {
    EditorStructureNode,
    SourceStateName,
    SourceStateStructureNode,
    StructureNode,
} from "../../../../runtime";
import { contextMenuButton, contextSeparator, positionContextMenu } from "./structureContextMenuItems";

type PendingPickerAction = {
    action: "add-child" | "add-source-state-child" | "add-root" | "replace";
    editor?: EditorStructureNode["editor"];
    sourceState?: SourceStateName;
};

export type StructureContextMenuContext = {
    appendMenu(menu: HTMLElement): void;
    canDelete(node: EditorStructureNode): boolean;
    canDuplicate(node: EditorStructureNode): boolean;
    childGroups(node: EditorStructureNode): BlockPickerSlotGroup[];
    closeContextMenu(): void;
    emitAction(action: "copy" | "paste-after" | "duplicate" | "delete" | "remove-repeat" | "configure-repeat" | "clear-source-state", editor?: EditorStructureNode["editor"], sourceState?: SourceStateName): void;
    hasEnabledGroup(groups: BlockPickerSlotGroup[]): boolean;
    isSnippetNode(node: EditorStructureNode): boolean;
    isSourceStateNode(node: StructureNode): node is SourceStateStructureNode;
    openPickerOrEmitSingleMedia(action: PendingPickerAction, groups: BlockPickerSlotGroup[], contextLabel: string): void;
    openRootPicker(): void;
    openSourcePicker(node: EditorStructureNode): void;
    openSourceStatePicker(node: SourceStateStructureNode): void;
    redirectToSnippetEditor(id: string): void;
    repeatableTargets: WeakSet<HTMLElement>;
    replaceGroups(node: EditorStructureNode): BlockPickerSlotGroup[];
    rootGroups(): BlockPickerSlotGroup[];
    sourceActionLabel(node: EditorStructureNode): string;
    sourceDataSourceCount(): number;
    sourceStateGroups(node: SourceStateStructureNode): BlockPickerSlotGroup[];
    snippetItemForNode(node: EditorStructureNode): { id: string } | null;
};

export function openStructureContextMenu(
    node: StructureNode,
    clientX: number,
    clientY: number,
    menu: HTMLElement,
    context: StructureContextMenuContext,
): void {
    context.closeContextMenu();
    if (context.isSourceStateNode(node)) {
        openSourceStateContextMenu(node, clientX, clientY, menu, context);
        return;
    }

    menu.replaceChildren();
    const sourceAction = contextMenuButton(context.sourceActionLabel(node), () => {
        context.openSourcePicker(node);
    }, context.closeContextMenu, undefined, context.sourceDataSourceCount() === 0);
    const repeatAction = node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)
        ? contextMenuButton("Remove repeat", () => context.emitAction("remove-repeat", node.editor), context.closeContextMenu)
        : contextMenuButton("Add repeat", () => context.emitAction("configure-repeat", node.editor), context.closeContextMenu, undefined, !context.repeatableTargets.has(node.target));
    const snippet = context.snippetItemForNode(node);
    const modifySnippetAction = contextMenuButton("Modify Snippet", () => {
        if (!snippet) return;
        context.redirectToSnippetEditor(snippet.id);
    }, context.closeContextMenu, undefined, !snippet);

    menu.append(
        contextMenuButton("Add child", () => {
            context.openPickerOrEmitSingleMedia({ action: "add-child", editor: node.editor }, context.childGroups(node), node.label);
        }, context.closeContextMenu, undefined, !context.hasEnabledGroup(context.childGroups(node))),
        contextMenuButton("Copy", () => context.emitAction("copy", node.editor), context.closeContextMenu),
        contextMenuButton("Paste after", () => context.emitAction("paste-after", node.editor), context.closeContextMenu),
        contextMenuButton("Duplicate", () => context.emitAction("duplicate", node.editor), context.closeContextMenu, undefined, !context.canDuplicate(node)),
        ...(context.isSnippetNode(node) ? [modifySnippetAction] : []),
        contextSeparator(),
        sourceAction,
        repeatAction,
        contextSeparator(),
        contextMenuButton("Replace", () => {
            context.openPickerOrEmitSingleMedia({ action: "replace", editor: node.editor }, context.replaceGroups(node), node.label);
        }, context.closeContextMenu, undefined, !context.hasEnabledGroup(context.replaceGroups(node))),
        contextMenuButton("Delete", () => context.emitAction("delete", node.editor), context.closeContextMenu, "danger", !context.canDelete(node)),
    );

    appendPositionedMenu(menu, clientX, clientY, context);
}

export function openRootContextMenu(clientX: number, clientY: number, menu: HTMLElement, context: StructureContextMenuContext): void {
    context.closeContextMenu();
    menu.replaceChildren(
        contextMenuButton("Add block", () => context.openRootPicker(), context.closeContextMenu, undefined, !context.hasEnabledGroup(context.rootGroups())),
        contextMenuButton("Paste", () => context.emitAction("paste-after"), context.closeContextMenu),
    );
    appendPositionedMenu(menu, clientX, clientY, context);
}

function openSourceStateContextMenu(
    node: SourceStateStructureNode,
    clientX: number,
    clientY: number,
    menu: HTMLElement,
    context: StructureContextMenuContext,
): void {
    menu.replaceChildren(
        contextMenuButton("Add block", () => {
            context.openSourceStatePicker(node);
        }, context.closeContextMenu, undefined, !context.hasEnabledGroup(context.sourceStateGroups(node))),
        contextMenuButton("Paste", () => context.emitAction("paste-after", node.sourceEditor, node.state), context.closeContextMenu),
        contextMenuButton("Clear state", () => context.emitAction("clear-source-state", node.sourceEditor, node.state), context.closeContextMenu, "danger", node.children.length === 0),
    );
    appendPositionedMenu(menu, clientX, clientY, context);
}

function appendPositionedMenu(menu: HTMLElement, clientX: number, clientY: number, context: StructureContextMenuContext): void {
    context.appendMenu(menu);
    positionContextMenu(menu, clientX, clientY);
}

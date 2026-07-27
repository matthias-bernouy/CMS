import type { EditorStructureNode, StructureNode } from "../../../../../runtime";
import {
    openRootContextMenu,
    openStructureContextMenu,
    type StructureContextMenuContext,
} from "../../Actions/structureContextMenus";
import type { StructureTreeController } from "./structureTreeController";
import { sourceActionLabel } from "../../Renderers/structureTreePresentation";

export class StructureTreeMenus {
    constructor(private readonly tree: StructureTreeController) {}

    openContextMenu(node: StructureNode, clientX: number, clientY: number, focusMenu = false): void {
        openStructureContextMenu(node, clientX, clientY, this.tree.refs.contextMenu, this.context(), focusMenu);
    }

    openRootContextMenu(clientX: number, clientY: number): void {
        openRootContextMenu(clientX, clientY, this.tree.refs.contextMenu, this.context());
    }

    private context(): StructureContextMenuContext {
        return {
            appendMenu: (menu) => this.tree.host.shadowRoot!.append(menu),
            canDelete: (node) => this.tree.nodes.canDelete(node),
            canDuplicate: (node) => this.tree.nodes.canDuplicate(node),
            childGroups: (node) => this.tree.pickers.childGroups(node),
            closeContextMenu: () => this.tree.emitter.closeContextMenu(),
            editingPolicy: this.tree.state.editingPolicy,
            emitAction: (action, editor) => this.tree.emitter.emitAction(action, editor),
            hasEnabledGroup: (groups) => this.tree.pickers.hasEnabledGroup(groups),
            openPickerOrEmitSingleMedia: (action, groups, contextLabel) =>
                this.tree.pickers.openPickerOrEmitSingleMedia(action, groups, contextLabel),
            openConditionPicker: (node) => this.tree.pickers.openConditionPicker(node),
            openRootPicker: () => this.tree.pickers.openRootPicker(),
            openSourcePicker: (node) => this.tree.pickers.openSourcePicker(node),
            moveNode: (source, target, position) =>
                this.tree.emitter.moveEditor(source.editor, target.editor, position),
            repeatableTargets: this.tree.state.repeatableTargets,
            replaceGroups: (node) => this.tree.pickers.replaceGroups(node),
            rootGroups: () => this.tree.pickers.rootGroups(),
            requestFocusRestore: () => {
                this.tree.state.restoreSelectedFocusOnRender = true;
            },
            sourceActionLabel: (node) => this.sourceActionLabel(node),
            sourceDataSourceCount: () => this.tree.nodes.sourceDataSources().length,
            sibling: (node, offset) => this.tree.nodes.sibling(node, offset),
        };
    }

    sourceActionLabel(node: EditorStructureNode): string {
        return sourceActionLabel(node);
    }
}

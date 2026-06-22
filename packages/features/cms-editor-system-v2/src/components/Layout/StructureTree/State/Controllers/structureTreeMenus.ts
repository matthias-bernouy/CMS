import type { EditorStructureNode, StructureNode } from "../../../../../runtime";
import { openRootContextMenu, openStructureContextMenu, type StructureContextMenuContext } from "../../Actions/structureContextMenus";
import type { StructureTreeController } from "./structureTreeController";

export class StructureTreeMenus {
    constructor(private readonly tree: StructureTreeController) {}

    openContextMenu(node: StructureNode, clientX: number, clientY: number): void {
        openStructureContextMenu(node, clientX, clientY, this.tree.refs.contextMenu, this.context());
    }

    openRootContextMenu(clientX: number, clientY: number): void {
        openRootContextMenu(clientX, clientY, this.tree.refs.contextMenu, this.context());
    }

    private context(): StructureContextMenuContext {
        return {
            appendMenu:                  menu => this.tree.host.shadowRoot!.append(menu),
            canDelete:                   node => this.tree.nodes.canDelete(node),
            canDuplicate:                node => this.tree.nodes.canDuplicate(node),
            childGroups:                 node => this.tree.pickers.childGroups(node),
            closeContextMenu:            () => this.tree.emitter.closeContextMenu(),
            emitAction:                  (action, editor, sourceState) => this.tree.emitter.emitAction(action, editor, undefined, undefined, sourceState),
            hasEnabledGroup:             groups => this.tree.pickers.hasEnabledGroup(groups),
            isSnippetNode:               node => this.tree.nodes.isSnippetNode(node),
            isSourceStateNode:           node => this.tree.nodes.isSourceStateNode(node),
            openPickerOrEmitSingleMedia: (action, groups, contextLabel) => this.tree.pickers.openPickerOrEmitSingleMedia(action, groups, contextLabel),
            openRootPicker:              () => this.tree.pickers.openRootPicker(),
            openSourcePicker:            node => this.tree.pickers.openSourcePicker(node),
            openSourceStatePicker:       node => this.tree.pickers.openSourceStatePicker(node),
            redirectToSnippetEditor:     id => this.tree.emitter.redirectToSnippetEditor(id),
            repeatableTargets:           this.tree.state.repeatableTargets,
            replaceGroups:               node => this.tree.pickers.replaceGroups(node),
            rootGroups:                  () => this.tree.pickers.rootGroups(),
            sourceActionLabel:           node => this.sourceActionLabel(node),
            sourceDataSourceCount:       () => this.tree.nodes.sourceDataSources().length,
            sourceStateGroups:           node => this.tree.pickers.sourceStateGroups(node),
            snippetItemForNode:          node => this.tree.nodes.snippetItemForNode(node),
        };
    }

    sourceActionLabel(node: EditorStructureNode): string {
        return this.tree.nodes.sourceActionLabel(node);
    }
}

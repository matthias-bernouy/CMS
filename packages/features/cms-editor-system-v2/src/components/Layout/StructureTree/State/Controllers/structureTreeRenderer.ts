import type { StructureNode } from "../../../../../runtime";
import { renderEmptyStructureTree } from "../../Renderers/structureEmptyTree";
import { renderStructureBadge } from "../../Renderers/structureTreePresentation";
import { renderStructureTreeRow } from "../../Renderers/structureTreeRow";
import type { StructureTreeKey, StructureTreeRenderRequest } from "../structureTreeTypes";
import type { StructureTreeController } from "./structureTreeController";

export class StructureTreeRenderer {
    constructor(private readonly tree: StructureTreeController) {}

    render(request: StructureTreeRenderRequest = {}): void {
        this.tree.state.scrollRequestId += 1;
        const treeEl = this.tree.refs.tree;
        const scrollContainer = this.tree.refs.scrollContainer;
        const previousScrollTop = scrollContainer.scrollTop;
        treeEl.replaceChildren();
        this.tree.refs.contextMenu.remove();

        if (this.tree.state.nodes.length === 0) {
            const defaultTemplates = this.tree.pickers.defaultTemplateItems();
            treeEl.append(renderEmptyStructureTree({
                defaultTemplates,
                openRootPicker:     () => this.tree.pickers.openRootPicker(),
                useDefaultTemplate: templates => this.tree.pickers.useDefaultTemplate(templates),
            }));
            return;
        }

        for (const node of this.tree.nodes.visibleNodes()) treeEl.append(this.renderNode(node.item, node.depth));
        if (request.anchor) this.restoreScrollAnchor(request.anchor);
        else if (this.tree.state.scrollSelectedIntoViewOnRender) this.scrollSelectedIntoView();
        else scrollContainer.scrollTop = previousScrollTop;
    }

    renderNode(node: StructureNode, depth: number): HTMLElement {
        return renderStructureTreeRow(node, depth, {
            selectedEditor:       this.tree.state.selectedEditor,
            clearDragState:       () => this.tree.events.clearDragState(),
            clearDropRow:         () => this.tree.events.clearDropRow(),
            iconClass:            value => this.tree.nodes.iconClass(value),
            iconText:             value => this.tree.nodes.iconText(value),
            isCollapsed:          value => this.tree.nodes.isCollapsed(value),
            itemClass:            value => this.tree.nodes.itemClass(value),
            nodeLabel:            value => this.tree.nodes.nodeLabel(value),
            onDragOver:           (value, row, event) => this.tree.events.onDragOver(value, row, event),
            onDragStart:          (value, event) => this.tree.events.onDragStart(value, event),
            onDrop:               (value, event) => this.tree.events.onDrop(value, event),
            openContextMenu:      (value, clientX, clientY) => this.tree.menus.openContextMenu(value, clientX, clientY),
            renderBadge:          value => renderStructureBadge(value),
            rowClass:             value => this.tree.nodes.rowClass(value),
            selectEditor:         editor => this.tree.emitter.selectEditor(editor),
            toggleBadges:         value => this.toggleBadges(value),
            toggleNode:           value => this.toggleNode(value),
            trackRenderedRow:     (value, row) => this.trackRenderedRow(value, row),
            visibleBadges:        value => this.tree.nodes.visibleBadges(value),
        });
    }

    toggleNode(node: StructureNode): void {
        const key = this.tree.nodes.nodeCollapseKey(node);
        const row = this.findRenderedRow(key);
        const anchor = row ? { key, offsetTop: row.getBoundingClientRect().top } : undefined;
        this.tree.nodes.toggleNode(node);
        this.render({ anchor });
    }

    toggleBadges(node: StructureNode): void {
        this.tree.nodes.toggleBadges(node);
        this.render();
    }

    trackRenderedRow(node: StructureNode, row: HTMLElement): void {
        const key = this.tree.nodes.nodeCollapseKey(node);
        if (typeof key === "object") this.tree.state.renderedRows.set(key, row);
    }

    findRenderedRow(key: StructureTreeKey): HTMLElement | null {
        return typeof key === "object" ? this.tree.state.renderedRows.get(key) ?? null : null;
    }

    scrollSelectedIntoView(): void {
        if (!this.tree.state.selectedEditor) return;
        const requestId = this.tree.state.scrollRequestId;
        requestAnimationFrame(() => this.scrollSelectedIntoViewNow(requestId));
    }

    private restoreScrollAnchor(anchor: { key: StructureTreeKey; offsetTop: number }): void {
        const row = this.findRenderedRow(anchor.key);
        if (!row) return;
        this.tree.refs.scrollContainer.scrollTop += row.getBoundingClientRect().top - anchor.offsetTop;
    }

    private scrollSelectedIntoViewNow(requestId: number): void {
        if (requestId !== this.tree.state.scrollRequestId) return;
        const selected = this.tree.host.shadowRoot!.querySelector<HTMLElement>(".item.selected");
        if (!selected) return;
        const scrollContainer = this.tree.refs.scrollContainer;
        const top = Math.max(0, selected.offsetTop - scrollContainer.clientHeight * 0.2 + selected.offsetHeight / 2);
        typeof scrollContainer.scrollTo === "function" ? scrollContainer.scrollTo({ top, behavior: "smooth" }) : scrollContainer.scrollTop = top;
    }
}

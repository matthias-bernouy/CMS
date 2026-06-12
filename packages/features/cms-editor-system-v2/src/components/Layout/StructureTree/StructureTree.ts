import type { Editor } from "@bernouy/cms-content/editor";
import type { EditorStructureNode } from "../../../runtime";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class StructureTree extends HTMLElement {
    private _nodes: EditorStructureNode[] = [];
    private _selectedEditor: Editor | null = null;
    private readonly _collapsedEditors = new Set<Editor>();

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    setStructure(nodes: EditorStructureNode[], selectedEditor: Editor | null = null): void {
        this._nodes = nodes;
        this._selectedEditor = selectedEditor;
        this._render();
    }

    private _render(): void {
        const tree = this.shadowRoot!.querySelector<HTMLElement>(".structure-tree")!;
        tree.replaceChildren();

        if (this._nodes.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "No editable elements";
            tree.append(empty);
            return;
        }

        for (const node of this._visibleNodes(this._nodes)) {
            tree.append(this._renderNode(node.item, node.depth));
        }
    }

    private _renderNode(node: EditorStructureNode, depth: number): HTMLElement {
        const row = document.createElement("div");
        row.className = "row";
        row.style.setProperty("--structure-depth", String(depth));

        if (node.children.length > 0) {
            const toggle = document.createElement("button");
            toggle.className = "toggle";
            toggle.type = "button";
            toggle.textContent = this._isCollapsed(node) ? "›" : "⌄";
            toggle.setAttribute("aria-label", this._isCollapsed(node) ? "Expand" : "Collapse");
            toggle.addEventListener("click", () => {
                this._toggleNode(node);
            });
            row.append(toggle);
        } else {
            const spacer = document.createElement("span");
            spacer.className = "toggle-spacer";
            row.append(spacer);
        }

        const button = document.createElement("button");
        button.className = "item";
        if (node.editor === this._selectedEditor) button.classList.add("selected");
        button.type = "button";
        button.addEventListener("click", () => {
            this.dispatchEvent(new CustomEvent("editor-v2:select-editor", {
                bubbles: true,
                composed: true,
                detail: { editor: node.editor },
            }));
        });

        const icon = document.createElement("span");
        icon.className = "icon";
        icon.textContent = this._iconText(node);

        const label = document.createElement("span");
        label.className = "label";
        label.textContent = node.label;

        button.append(icon, label);
        row.append(button);

        return row;
    }

    private _visibleNodes(nodes: EditorStructureNode[], depth = 0): { item: EditorStructureNode; depth: number }[] {
        return nodes.flatMap(node => {
            const current = [{ item: node, depth }];
            if (this._isCollapsed(node)) return current;
            return [
                ...current,
                ...this._visibleNodes(node.children, depth + 1),
            ];
        });
    }

    private _toggleNode(node: EditorStructureNode): void {
        if (this._isCollapsed(node)) {
            this._collapsedEditors.delete(node.editor);
        } else {
            this._collapsedEditors.add(node.editor);
        }
        this._render();
    }

    private _isCollapsed(node: EditorStructureNode): boolean {
        return this._collapsedEditors.has(node.editor);
    }

    private _iconText(node: EditorStructureNode): string {
        if (node.icon) return node.icon.slice(0, 1).toUpperCase();
        return node.label.slice(0, 1).toUpperCase();
    }
}

if (!customElements.get("cms-editor-v2-structure-tree")) {
    customElements.define("cms-editor-v2-structure-tree", StructureTree);
}

import type { Editor } from "@bernouy/cms-content/editor";
import type { EditorStructureNode } from "../../../runtime";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class StructureTree extends HTMLElement {
    private _nodes: EditorStructureNode[] = [];
    private _selectedEditor: Editor | null = null;

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

        for (const node of this._flatten(this._nodes)) {
            tree.append(this._renderNode(node.item, node.depth));
        }
    }

    private _renderNode(node: EditorStructureNode, depth: number): HTMLButtonElement {
        const button = document.createElement("button");
        button.className = `item depth-${Math.min(depth, 2)}`;
        if (node.editor === this._selectedEditor) button.classList.add("selected");
        button.type = "button";
        button.addEventListener("click", () => {
            this.dispatchEvent(new CustomEvent("editor-v2:select-editor", {
                bubbles: true,
                composed: true,
                detail: { editor: node.editor },
            }));
        });

        const twisty = document.createElement("span");
        twisty.className = "twisty";
        twisty.textContent = node.children.length > 0 ? "⌄" : "";

        const icon = document.createElement("span");
        icon.className = "icon";
        icon.textContent = this._iconText(node);

        const label = document.createElement("span");
        label.className = "label";
        label.textContent = node.label;

        button.append(twisty, icon, label);

        if (node.editor === this._selectedEditor) {
            const badge = document.createElement("span");
            badge.className = "badge";
            badge.textContent = "Selected";
            button.append(badge);
        }

        return button;
    }

    private _flatten(nodes: EditorStructureNode[], depth = 0): { item: EditorStructureNode; depth: number }[] {
        return nodes.flatMap(node => [
            { item: node, depth },
            ...this._flatten(node.children, depth + 1),
        ]);
    }

    private _iconText(node: EditorStructureNode): string {
        if (node.icon) return node.icon.slice(0, 1).toUpperCase();
        return node.label.slice(0, 1).toUpperCase();
    }
}

if (!customElements.get("cms-editor-v2-structure-tree")) {
    customElements.define("cms-editor-v2-structure-tree", StructureTree);
}

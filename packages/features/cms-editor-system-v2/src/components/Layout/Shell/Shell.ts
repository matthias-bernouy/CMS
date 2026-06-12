import "../TopBar/TopBar";
import "../Panel/Panel";
import "../StructureTree/StructureTree";
import "../Canvas/Canvas";
import "../../Settings/SettingsView/SettingsView";
import {
    Editor,
    type EditorCatalog,
    type EditorDocument,
} from "@bernouy/cms-content/editor";
import {
    EditorRuntime,
    type EditorStructureNode,
} from "../../../runtime";
import type { SettingsView } from "../../Settings/SettingsView/SettingsView";
import {
    CANVAS_FRAME_READY_EVENT,
    type Canvas,
    type CanvasFrameReadyDetail,
} from "../Canvas/Canvas";
import type { StructureTree } from "../StructureTree/StructureTree";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export class Shell extends HTMLElement {

    private _catalog: EditorCatalog = [];
    private _runtime: EditorRuntime | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this._structureTree.addEventListener("editor-v2:select-editor", this._onSelectEditor);
        this._canvas.addEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady as EventListener);
    }

    disconnectedCallback(): void {
        this._structureTree.removeEventListener("editor-v2:select-editor", this._onSelectEditor);
        this._canvas.removeEventListener(CANVAS_FRAME_READY_EVENT, this._onFrameReady as EventListener);
        this._runtime?.dispose();
        this._runtime = null;
    }

    get catalog(): EditorCatalog {
        return this._catalog;
    }

    set catalog(catalog: EditorCatalog) {
        this.setCatalog(catalog);
    }

    setCatalog(catalog: EditorCatalog): void {
        this._catalog = [...catalog];
        this.setAttribute("catalog-size", String(this._catalog.length));
    }

    loadDocument(document: EditorDocument, initialSelection?: HTMLElement | Editor | null): void {
        this._runtime?.dispose();
        this._runtime = new EditorRuntime(this._catalog);
        this._runtime.load(document);
        this._renderStructure();

        if (initialSelection !== undefined) {
            this._select(!initialSelection
                ? null
                : initialSelection instanceof Editor
                ? initialSelection
                : this._runtime.getEditor(initialSelection) ?? null);
            return;
        }

        const firstEditor = this._runtime.getStructure()[0]?.editor ?? null;
        this._select(firstEditor);
    }

    private readonly _onSelectEditor = (event: Event): void => {
        const editor = (event as CustomEvent<{ editor: Editor }>).detail.editor;
        this._select(editor);
    };

    private readonly _onFrameReady = (event: CustomEvent<CanvasFrameReadyDetail>): void => {
        const frameDocument = event.detail.document;
        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")
            ?? frameDocument.querySelector<HTMLElement>("cms-binding-core");
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]");

        if (!root || !contentRoot) {
            this._runtime?.dispose();
            this._runtime = null;
            this._renderStructure();
            this._settings.setSettings([]);
            this._setSelectionStatus(null);
            return;
        }

        this.loadDocument({
            root,
            contentRoot,
        }, frameDocument.querySelector<HTMLElement>("[data-cms-initial-selection]") ?? undefined);
    };

    private _select(editor: Editor | null): void {
        if (!this._runtime) return;

        const selection = this._runtime.select(editor);
        this._renderStructure();

        if (!selection) {
            this._settings.setSettings([]);
            this._setSelectionStatus(null);
            return;
        }

        this._settings.setSettings(selection.settings, this._runtime.getSelectedDataScopes());
        this._setSelectionStatus(selection.editor);
    }

    private _renderStructure(): void {
        if (!this._runtime) {
            this._structureTree.setStructure([]);
            return;
        }

        const structure = this._runtime.getStructure();
        this._structureTree.setStructure(structure, this._runtime.getSelection()?.editor ?? null);
    }

    private _setSelectionStatus(editor: Editor | null): void {
        this.shadowRoot!.querySelector(".selection-status")!.textContent = editor
            ? `Selected ${this._findStructureNodeLabel(editor) ?? editor.target.localName}`
            : "No selection";
    }

    private _findStructureNodeLabel(editor: Editor): string | null {
        const visit = (nodes: EditorStructureNode[]): string | null => {
            for (const node of nodes) {
                if (node.editor === editor) return node.label;
                const childLabel = visit(node.children);
                if (childLabel) return childLabel;
            }
            return null;
        };

        return this._runtime ? visit(this._runtime.getStructure()) : null;
    }

    private get _structureTree(): StructureTree {
        return this.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as StructureTree;
    }

    private get _settings(): SettingsView {
        return this.shadowRoot!.querySelector("cms-editor-v2-settings-view") as SettingsView;
    }

    private get _canvas(): Canvas {
        return this.shadowRoot!.querySelector("cms-editor-v2-canvas") as Canvas;
    }

}

if (!customElements.get("cms-editor-v2-shell")) {
    customElements.define("cms-editor-v2-shell", Shell);
}

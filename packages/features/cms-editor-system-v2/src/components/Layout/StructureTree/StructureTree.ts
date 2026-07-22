import "../Pickers/DataSourcePicker/DataSourcePicker";
import "../Pickers/ConditionPicker/ConditionPicker";
import type { Editor, EditorCatalog } from "@bernouy/cms-content/editor";
import type { BlockPickerItem } from "../Pickers/BlockPickerModal/BlockPickerModal";
import type { EditorDataSource, StructureNode } from "../../../runtime";
import { StructureTreeController } from "./State/Controllers/structureTreeController";
import type { DefaultTemplateSelection } from "./Pickers/structurePickerGroups";
import type { StructureTreeRenderOptions } from "./State/structureTreeTypes";
import badgesCss from "./Styles/badges.css" with { type: "text" };
import contextCss from "./Styles/context.css" with { type: "text" };
import sourceStatesCss from "./Styles/sourceStates.css" with { type: "text" };
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${[componentCss, sourceStatesCss, badgesCss, contextCss]
    .map((css) => String(css))
    .join("\n")}</style>${String(templateHtml)}`;

export type { DefaultTemplateSelection } from "./Pickers/structurePickerGroups";
export type {
    StructureTreeAction,
    StructureTreeActionDetail,
    StructureTreeRenderOptions,
} from "./State/structureTreeTypes";

export class StructureTree extends HTMLElement {
    readonly controller: StructureTreeController;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
        this.controller = new StructureTreeController(this);
    }

    connectedCallback(): void {
        this.controller.connect();
    }

    disconnectedCallback(): void {
        this.controller.disconnect();
    }

    setCatalog(catalog: EditorCatalog): void {
        this.controller.setCatalog(catalog);
    }

    setInsertItems(items: BlockPickerItem[]): void {
        this.controller.setInsertItems(items);
    }

    setDefaultTemplateSelection(selection: DefaultTemplateSelection): void {
        this.controller.setDefaultTemplateSelection(selection);
    }

    setDataSources(sources: EditorDataSource[]): void {
        this.controller.setDataSources(sources);
    }

    get catalog(): EditorCatalog {
        return this.controller.catalog;
    }

    set catalog(catalog: EditorCatalog) {
        this.controller.catalog = catalog;
    }

    setStructure(
        nodes: StructureNode[],
        selectedEditor: Editor | null = null,
        catalog: EditorCatalog = this.controller.catalog,
        options: StructureTreeRenderOptions = {},
    ): void {
        this.controller.setStructure(nodes, selectedEditor, catalog, options);
    }
}

if (!customElements.get("cms-editor-v2-structure-tree")) {
    customElements.define("cms-editor-v2-structure-tree", StructureTree);
}

import {
    type Editor,
    type EditorCatalog,
    type EditorDocument,
} from "@bernouy/cms-content/editor";

import { EditorRuntime, type EditorDataSource } from "../../../../../runtime";
import type { DefaultTemplateSelection } from "../../../StructureTree/StructureTree";
import type { BlockPickerItem } from "../../../BlockPickerModal/BlockPickerModal";
import type { SelectOptions, EditorV2PageConfig } from "../shellTypes";

type ApiContext = {
    catalog(): EditorCatalog;
    setCatalogValue(catalog: EditorCatalog): void;
    setCatalogSize(size: number): void;
    setInsertItemsValue(items: BlockPickerItem[]): void;
    setDefaultTemplateSelectionValue(selection: DefaultTemplateSelection): void;
    setDataSourcesValue(sources: EditorDataSource[]): void;
    setPageConfigValue(config: EditorV2PageConfig): void;
    topBarTitle(title: string, path: string): void;
    syncStructureTreeCatalog(): void;
    syncStructureTreeInsertItems(): void;
    syncStructureTreeDefaultTemplateSelection(): void;
    syncStructureTreeDataSources(): void;
    syncPageSettingsForm(): void;
    renderStructure(): void;
    exitAllStateSessions(): void;
    disposeRuntime(): void;
    setEditorDocument(document: EditorDocument | null): void;
    setRuntime(runtime: EditorRuntime | null): void;
    runtime(): EditorRuntime | null;
    dataSources(): EditorDataSource[];
    select(editor: Editor | null, options?: SelectOptions): void;
};

export class ShellApi {
    constructor(private readonly context: ApiContext) {}

    setCatalog(catalog: EditorCatalog): void {
        this.context.setCatalogValue([...catalog]);
        this.context.setCatalogSize(catalog.length);
        this.context.syncStructureTreeCatalog();
    }

    setInsertItems(items: BlockPickerItem[]): void {
        this.context.setInsertItemsValue(items.map(item => ({ ...item })));
        this.context.syncStructureTreeInsertItems();
        if (this.context.runtime()) this.context.renderStructure();
    }

    setDefaultTemplateSelection(selection: DefaultTemplateSelection): void {
        this.context.setDefaultTemplateSelectionValue({ ...selection });
        this.context.syncStructureTreeDefaultTemplateSelection();
    }

    setDataSources(sources: EditorDataSource[]): void {
        this.context.setDataSourcesValue(sources.map(source => ({
            ...source,
            fields: [...source.fields],
        })));
        this.context.syncStructureTreeDataSources();
    }

    setPageConfig(config: EditorV2PageConfig): void {
        this.context.setPageConfigValue({
            ...config,
            tags: [...config.tags],
        });
        if (config.defaultTemplateCategory) {
            this.setDefaultTemplateSelection({ category: config.defaultTemplateCategory });
        }
        this.context.topBarTitle(config.title, config.path);
        this.context.syncPageSettingsForm();
    }

    loadDocument(document: EditorDocument, selectedTarget: HTMLElement | null = null): void {
        this.context.exitAllStateSessions();
        this.context.disposeRuntime();
        this.context.setEditorDocument(document);
        const runtime = new EditorRuntime(this.context.catalog(), this.context.dataSources());
        this.context.setRuntime(runtime);
        runtime.load(document);
        this.context.renderStructure();
        this.context.select(selectedTarget
            ? runtime.getEditor(selectedTarget) ?? runtime.getClosestEditor(selectedTarget) ?? null
            : null, { scrollStructureIntoView: true });
    }
}

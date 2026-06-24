import {
    type EditorCatalog,
    type EditorDocument,
} from "@bernouy/cms-content/editor";

import { EditorRuntime, type EditorDataSource } from "../../../../../runtime";
import type { DefaultTemplateSelection } from "../../../StructureTree/StructureTree";
import type { BlockPickerItem } from "../../../BlockPickerModal/BlockPickerModal";
import type { EditorV2PageConfig } from "../shellTypes";
import type { ShellDomRefs } from "../../Domain/shellDomRefs";
import type { ShellCommands } from "./shellCommands";
import type { ShellRenderSyncCommands } from "./shellRenderSyncCommands";
import type { ShellState } from "./Services/shellState";

type ApiContext = {
    host: HTMLElement;
    state: ShellState;
    refs: ShellDomRefs;
    renderSync: ShellRenderSyncCommands;
    commands: ShellCommands;
};

export class ShellApi {
    constructor(private readonly context: ApiContext) {}

    setCatalog(catalog: EditorCatalog): void {
        this.context.state.catalog = [...catalog];
        this.context.host.setAttribute("catalog-size", String(catalog.length));
        this.context.renderSync.syncStructureTreeCatalog();
    }

    setInsertItems(items: BlockPickerItem[]): void {
        this.context.state.insertItems = items.map(item => ({ ...item }));
        this.context.renderSync.syncStructureTreeInsertItems();
        if (this.context.state.runtime) this.context.commands.renderStructure();
    }

    setDefaultTemplateSelection(selection: DefaultTemplateSelection): void {
        this.context.state.defaultTemplateSelection = { ...selection };
        this.context.renderSync.syncStructureTreeDefaultTemplateSelection();
    }

    setDataSources(sources: EditorDataSource[]): void {
        this.context.state.dataSources = sources.map(source => ({
            ...source,
            fields: [...source.fields],
            ...(source.params ? { params: [...source.params] } : {}),
            ...(source.body ? { body: {
                ...source.body,
                fields: [...source.body.fields],
            } } : {}),
        }));
        this.context.renderSync.syncStructureTreeDataSources();
    }

    setPageConfig(config: EditorV2PageConfig): void {
        this.context.state.pageConfig = {
            ...config,
            tags: [...config.tags],
        };
        if (config.defaultTemplateCategory) {
            this.setDefaultTemplateSelection({ category: config.defaultTemplateCategory });
        }
        this.context.refs.topBar.setPageTitle(config.title, config.path);
        this.context.renderSync.syncPageSettingsForm();
    }

    loadDocument(document: EditorDocument, selectedTarget: HTMLElement | null = null): void {
        this.context.commands.exitAllStateSessions();
        this.context.state.runtime?.dispose();
        this.context.state.editorDocument = document;
        const runtime = new EditorRuntime(this.context.state.catalog, this.context.state.dataSources);
        this.context.state.runtime = runtime;
        runtime.load(document);
        this.context.commands.renderStructure();
        this.context.commands.select(selectedTarget
            ? runtime.getEditor(selectedTarget) ?? runtime.getClosestEditor(selectedTarget) ?? null
            : null, { scrollStructureIntoView: true });
    }
}

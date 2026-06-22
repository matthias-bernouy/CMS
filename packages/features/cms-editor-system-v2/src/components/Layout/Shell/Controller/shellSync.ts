import type { Editor, EditorCatalog } from "@bernouy/cms-content/editor";

import type { EditorDataSource } from "../../../../runtime";
import type { TopBar } from "../../TopBar/TopBar";
import type { StructureTree } from "../../StructureTree/StructureTree";
import type { DefaultTemplateSelection } from "../../StructureTree/StructureTree";
import type { BlockPickerItem } from "../../BlockPickerModal/BlockPickerModal";
import type { ShellDomRefs } from "../Domain/shellDomRefs";
import type { EditorV2PageConfig } from "./shellTypes";
import {
    applyShellChromeLabels,
    shellResourceChromeDefaults,
    type ShellChromeDefaults,
} from "../Domain/shellChrome";
import {
    applyPageSettingsTitle,
    closePageSettingsModal,
    openPageSettingsModal,
    readPageSettingsForm,
    syncPageSettingsForm,
} from "../Domain/shellPageSettings";
import {
    isStructureTree,
    syncStructureTreeCatalog,
    syncStructureTreeDefaultTemplateSelection,
    syncStructureTreeInsertItems,
} from "../Domain/shellStructureTreeSync";
import { syncStructureTreeDataSources } from "../Domain/Structure/structureDataSources";
import { findStructureNodeLabel } from "../Domain/Structure/structureRender";
import type { EditorRuntime } from "../../../../runtime";

type SyncContext = {
    host: HTMLElement;
    root(): ShadowRoot;
    refs(): ShellDomRefs;
    topBar(): TopBar;
    pageConfig(): EditorV2PageConfig | null;
    setPageConfig(config: EditorV2PageConfig | null): void;
    catalog(): EditorCatalog;
    insertItems(): BlockPickerItem[];
    defaultTemplateSelection(): DefaultTemplateSelection;
    dataSources(): EditorDataSource[];
    runtime(): EditorRuntime | null;
    chromeSyncPending(): boolean;
    setChromeSyncPending(value: boolean): void;
};

export class ShellSync {
    constructor(private readonly context: SyncContext) {}

    syncChromeLabels(): void {
        const resource = this.context.host.getAttribute("resource") ?? "page";
        const defaults = shellResourceChromeDefaults(resource);
        const topBar = this.context.root().querySelector("cms-editor-v2-topbar");
        if (!this.isTopBar(topBar)) {
            this.requestChromeSyncWhenTopBarIsReady();
            return;
        }
        this.applyChromeLabels(topBar, resource, defaults);
    }

    openPageSettings(): void {
        openPageSettingsModal(this.context.refs().pageSettingsModal);
    }

    closePageSettings(): void {
        closePageSettingsModal(this.context.refs().pageSettingsModal);
    }

    syncPageSettingsForm(): void {
        syncPageSettingsForm(this.context.pageConfig(), name => this.pageField(name));
    }

    applyPageSettingsForm(): void {
        const pageConfig = readPageSettingsForm(this.context.pageConfig(), name => this.pageField(name));
        this.context.setPageConfig(pageConfig);
        applyPageSettingsTitle(this.context.topBar(), pageConfig);
    }

    setSaveStatus(label: string): void {
        this.context.topBar().saveStatus = label;
    }

    syncStructureTreeCatalog(): void {
        syncStructureTreeCatalog(
            this.context.root(),
            this.context.catalog(),
            this.context.insertItems(),
            this.context.defaultTemplateSelection(),
        );
    }

    syncStructureTreeInsertItems(): void {
        syncStructureTreeInsertItems(
            this.context.root(),
            this.context.insertItems(),
            this.context.defaultTemplateSelection(),
        );
    }

    syncStructureTreeDefaultTemplateSelection(): void {
        syncStructureTreeDefaultTemplateSelection(
            this.context.root(),
            this.context.defaultTemplateSelection(),
        );
    }

    syncStructureTreeDataSources(): void {
        syncStructureTreeDataSources(this.context.root(), this.context.dataSources(), isStructureTree);
    }

    findStructureNodeLabel(editor: Editor): string | null {
        return findStructureNodeLabel(this.context.runtime(), editor);
    }

    isStructureTree(value: Element | null | undefined): value is StructureTree {
        return isStructureTree(value);
    }

    private applyChromeLabels(topBar: TopBar, resource: string, defaults: ShellChromeDefaults): void {
        applyShellChromeLabels(this.context.host, topBar, resource, defaults, name => this.pageField(name));
    }

    private requestChromeSyncWhenTopBarIsReady(): void {
        if (this.context.chromeSyncPending()) return;
        this.context.setChromeSyncPending(true);
        customElements.whenDefined("cms-editor-v2-topbar").then(() => {
            this.context.setChromeSyncPending(false);
            const topBar = this.context.root().querySelector("cms-editor-v2-topbar");
            if (topBar) customElements.upgrade(topBar);
            if (!this.isTopBar(topBar)) return;
            const resource = this.context.host.getAttribute("resource") ?? "page";
            this.applyChromeLabels(topBar, resource, shellResourceChromeDefaults(resource));
        });
    }

    private pageField<T extends HTMLElement>(name: string): T {
        return this.context.refs().pageField<T>(name);
    }

    private isTopBar(value: Element | null | undefined): value is TopBar {
        return Boolean(value && "setNavigation" in value);
    }
}

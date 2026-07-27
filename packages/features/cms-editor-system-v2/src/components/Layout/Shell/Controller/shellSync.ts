import type { Editor } from "@bernouy/cms-content/editor";

import type { TopBar } from "../../TopBar/TopBar";
import type { StructureTree } from "../../StructureTree/StructureTree";
import type { ShellDomRefs } from "../Domain/shellDomRefs";
import { applyShellChromeLabels, shellResourceChromeDefaults, type ShellChromeDefaults } from "../Domain/shellChrome";
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
    syncStructureTreeEditingPolicy,
} from "../Domain/shellStructureTreeSync";
import { syncStructureTreeDataSources } from "../Domain/Structure/structureDataSources";
import { findStructureNodeLabel } from "../Domain/Structure/structureRender";
import type { ShellState } from "./Core/Services/shellState";

type SyncContext = {
    host: HTMLElement;
    state: ShellState;
    refs: ShellDomRefs;
};

export class ShellSync {
    constructor(private readonly context: SyncContext) {}

    syncChromeLabels(): void {
        const resource = this.context.host.getAttribute("resource") ?? "page";
        const defaults = shellResourceChromeDefaults(resource);
        const topBar = this.context.host.shadowRoot!.querySelector("cms-editor-v2-topbar");
        if (!this.isTopBar(topBar)) {
            this.requestChromeSyncWhenTopBarIsReady();
            return;
        }
        this.applyChromeLabels(topBar, resource, defaults);
    }

    openPageSettings(): void {
        openPageSettingsModal(this.context.refs.pageSettingsModal);
    }

    closePageSettings(): void {
        closePageSettingsModal(this.context.refs.pageSettingsModal);
    }

    syncPageSettingsForm(): void {
        syncPageSettingsForm(this.context.state.pageConfig, (name) => this.pageField(name));
    }

    applyPageSettingsForm(): void {
        const pageConfig = readPageSettingsForm(this.context.state.pageConfig, (name) => this.pageField(name));
        this.context.state.pageConfig = pageConfig;
        applyPageSettingsTitle(this.context.refs.topBar, pageConfig);
    }

    setSaveStatus(label: string): void {
        this.context.refs.topBar.saveStatus = label;
    }

    syncStructureTreeCatalog(): void {
        syncStructureTreeCatalog(
            this.context.host.shadowRoot!,
            this.context.state.catalog,
            this.context.state.insertItems,
            this.context.state.defaultTemplateSelection,
        );
    }

    syncStructureTreeInsertItems(): void {
        syncStructureTreeInsertItems(
            this.context.host.shadowRoot!,
            this.context.state.insertItems,
            this.context.state.defaultTemplateSelection,
        );
    }

    syncStructureTreeDefaultTemplateSelection(): void {
        syncStructureTreeDefaultTemplateSelection(
            this.context.host.shadowRoot!,
            this.context.state.defaultTemplateSelection,
        );
    }

    syncStructureTreeDataSources(): void {
        syncStructureTreeDataSources(this.context.host.shadowRoot!, this.context.state.dataSources, isStructureTree);
    }

    syncStructureTreeEditingPolicy(): void {
        syncStructureTreeEditingPolicy(this.context.host.shadowRoot!, this.context.state.editingPolicy);
    }

    findStructureNodeLabel(editor: Editor): string | null {
        return findStructureNodeLabel(this.context.state.runtime, editor);
    }

    isStructureTree(value: Element | null | undefined): value is StructureTree {
        return isStructureTree(value);
    }

    private applyChromeLabels(topBar: TopBar, resource: string, defaults: ShellChromeDefaults): void {
        applyShellChromeLabels(this.context.host, topBar, resource, defaults, (name) => this.pageField(name));
    }

    private requestChromeSyncWhenTopBarIsReady(): void {
        if (this.context.state.chromeSyncPending) {
            return;
        }
        this.context.state.chromeSyncPending = true;
        customElements.whenDefined("cms-editor-v2-topbar").then(() => {
            this.context.state.chromeSyncPending = false;
            const topBar = this.context.host.shadowRoot!.querySelector("cms-editor-v2-topbar");
            if (topBar) {
                customElements.upgrade(topBar);
            }
            if (!this.isTopBar(topBar)) {
                return;
            }
            const resource = this.context.host.getAttribute("resource") ?? "page";
            this.applyChromeLabels(topBar, resource, shellResourceChromeDefaults(resource));
        });
    }

    private pageField<T extends HTMLElement>(name: string): T {
        return this.context.refs.pageField<T>(name);
    }

    private isTopBar(value: Element | null | undefined): value is TopBar {
        return Boolean(value && "setNavigation" in value);
    }
}

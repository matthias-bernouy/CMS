import { Component, type ComponentMetadata } from 'src/control/core/editorSystem/Component';
import getClosestEditorSystem from 'src/control/core/dom/editor/getClosestEditorSystem';
import html from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import { fetchBlocMeta, fetchSnippets, fetchTemplates } from './api';
import { renderBlocs } from './sections/renderBlocs';
import { renderTemplates } from './sections/renderTemplates';
import { renderSnippets } from './sections/renderSnippets';
import { renderSearch } from './sections/renderSearch';
import type { BlocMeta, InsertDetail, Section, SnippetItem, TemplateItem } from './types';

import './components/Card/Card';
import './components/EmptyState/EmptyState';

const Metadata: ComponentMetadata = {
    css,
    template: html as unknown as string,
};

export class BlocLibrary extends Component {
    private _dialog!: HTMLDialogElement;
    private _section: Section = 'blocs';
    private _activeGroup: string | null = null;
    private _query: string = '';

    private _templates: TemplateItem[] = [];
    private _snippets: SnippetItem[] = [];
    private _blocMeta: Map<string, BlocMeta> = new Map();
    private _dataLoaded: boolean = false;

    constructor() {
        super(Metadata);
    }

    override connectedCallback() {
        const s = this.shadowRoot!;
        this._dialog = s.querySelector('#dialog') as HTMLDialogElement;

        this._dialog.addEventListener('click', (e) => {
            if (e.target === this._dialog) this.close();
        });

        s.getElementById('tabs')!.addEventListener('click', (e) => this._onTabClick(e));
        s.getElementById('sidebar')!.addEventListener('click', (e) => this._onSidebarClick(e));
        s.getElementById('search')!.addEventListener('input', (e) => this._onSearchInput(e));
    }

    open() {
        this._dialog.showModal();
        void this._refresh();
    }

    close() {
        this._dialog.close();
    }

    private async _refresh() {
        if (!this._dataLoaded) {
            const [templates, snippets, blocMeta] = await Promise.all([
                fetchTemplates(),
                fetchSnippets(),
                fetchBlocMeta(),
            ]);
            this._templates = templates;
            this._snippets = snippets;
            this._blocMeta = blocMeta;
            this._dataLoaded = true;
        }

        if (!this._activeGroup && this._section === 'blocs') {
            const groups = Array.from(getClosestEditorSystem(this).observer.getGroups());
            if (groups.length > 0) this._activeGroup = groups[0]!;
        }

        this._render();
        (this.shadowRoot!.getElementById('search') as HTMLInputElement).focus();
    }

    private _onTabClick(e: Event) {
        const tab = (e.target as HTMLElement).closest('.tab') as HTMLElement | null;
        if (!tab || !tab.dataset.section) return;
        this._section = tab.dataset.section as Section;
        this._activeGroup = null;
        this._render();
    }

    private _onSidebarClick(e: Event) {
        const item = (e.target as HTMLElement).closest('.sidebar-item') as HTMLElement | null;
        if (!item) return;
        this._activeGroup = item.dataset.group ?? null;
        this._render();
    }

    private _onSearchInput(e: Event) {
        this._query = (e.target as HTMLInputElement).value;
        this._render();
    }

    private _render() {
        const searching = this._query.trim().length > 0;
        this._renderTabs(searching);
        this._renderSidebar(searching);
        this._renderGrid(searching);
    }

    private _renderTabs(searching: boolean) {
        this.shadowRoot!.querySelectorAll<HTMLElement>('.tab').forEach(tab => {
            tab.classList.toggle('active', !searching && tab.dataset.section === this._section);
        });
    }

    private _renderSidebar(searching: boolean) {
        const sidebar = this.shadowRoot!.getElementById('sidebar')!;
        sidebar.innerHTML = '';
        sidebar.style.display = searching ? 'none' : '';
        if (searching) return;

        const groups = this._getGroups();
        if (this._activeGroup === null && groups.length > 0) {
            this._activeGroup = groups[0]!;
        }
        for (const group of groups) {
            const btn = document.createElement('button');
            btn.className = `sidebar-item ${group === this._activeGroup ? 'active' : ''}`;
            btn.dataset.group = group;
            btn.textContent = group;
            sidebar.appendChild(btn);
        }
    }

    private _renderGrid(searching: boolean) {
        const editorSystem = getClosestEditorSystem(this);
        const grid = this.shadowRoot!.getElementById('grid')!;
        grid.innerHTML = '';

        const onPick = (detail: InsertDetail) => this._emitInsert(detail);

        if (searching) {
            renderSearch({
                grid,
                query: this._query,
                blocs: Array.from(editorSystem.observer.getItems()),
                blocMeta: this._blocMeta,
                templates: this._templates,
                snippets: this._snippets,
                onPick,
            });
            return;
        }

        if (this._section === 'blocs') {
            if (!this._activeGroup) return;
            renderBlocs({
                grid,
                items: Array.from(editorSystem.observer.getItemsByGroup(this._activeGroup)),
                blocMeta: this._blocMeta,
                onPick,
            });
        } else if (this._section === 'templates') {
            renderTemplates({ grid, templates: this._templates, category: this._activeGroup, onPick });
        } else {
            renderSnippets({ grid, snippets: this._snippets, category: this._activeGroup, onPick });
        }
    }

    private _getGroups(): string[] {
        const editorSystem = getClosestEditorSystem(this);
        if (this._section === 'blocs') return Array.from(editorSystem.observer.getGroups());
        if (this._section === 'templates') return Array.from(new Set(this._templates.map(t => t.category || 'Default')));
        return Array.from(new Set(this._snippets.map(s => s.category || 'Default')));
    }

    private _emitInsert(detail: InsertDetail) {
        this.dispatchEvent(new CustomEvent('insert', { detail, bubbles: true, composed: true }));
        this.close();
    }
}

if (!customElements.get('cms-bloc-library')) {
    customElements.define('cms-bloc-library', BlocLibrary);
}

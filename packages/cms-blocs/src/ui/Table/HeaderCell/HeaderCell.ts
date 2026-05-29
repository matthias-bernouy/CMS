import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import baseCss from './base.css' with { type: 'text' };
import variantCss from './variant.css' with { type: 'text' };
const css = baseCss + variantCss;

import { syncFilterState } from './compute';
import {
    handleSortClick, handleFilterToggle, handleFilterEnter, closeFilterPopover,
} from './listener';

export class TableHeaderCell extends Component {
    private _sortTrigger: HTMLElement | null;
    private _filterBtn: HTMLElement | null;
    private _filterPopover: HTMLElement | null;
    private _filterInput: HTMLInputElement | null;

    static get observedAttributes() { return ['sort', 'filter-name']; }

    constructor() {
        super({ css, template: template as unknown as string });
        this._sortTrigger = this.shadowRoot?.querySelector('#sort-trigger') ?? null;
        this._filterBtn = this.shadowRoot?.querySelector('#filter-btn') ?? null;
        this._filterPopover = this.shadowRoot?.querySelector('#filter-popover') ?? null;
        this._filterInput = this.shadowRoot?.querySelector('#filter-input') ?? null;
    }

    override connectedCallback() {
        syncFilterState(this, this._filterBtn, this._filterInput);

        this._sortTrigger?.addEventListener('click', this._onSort);
        this._filterBtn?.addEventListener('click', this._onFilterToggle);
        this._filterPopover?.addEventListener('click', this._stopPropagation);
        this._filterInput?.addEventListener('keydown', this._onFilterKey);
        window.addEventListener('click', this._onWindowClick);
    }

    disconnectedCallback() {
        this._sortTrigger?.removeEventListener('click', this._onSort);
        this._filterBtn?.removeEventListener('click', this._onFilterToggle);
        this._filterPopover?.removeEventListener('click', this._stopPropagation);
        this._filterInput?.removeEventListener('keydown', this._onFilterKey);
        window.removeEventListener('click', this._onWindowClick);
    }

    attributeChangedCallback() {
        syncFilterState(this, this._filterBtn, this._filterInput);
    }

    private _onSort = (e: Event) => handleSortClick(this, e);
    private _onFilterToggle = (e: Event) => handleFilterToggle(e, this._filterBtn, this._filterPopover, this._filterInput);
    private _onFilterKey = (e: KeyboardEvent) => handleFilterEnter(this, this._filterInput, e);
    private _onWindowClick = () => closeFilterPopover(this._filterBtn, this._filterPopover);
    private _stopPropagation = (e: Event) => e.stopPropagation();
}

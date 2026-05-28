import { Component, type ComponentMetadata } from 'src/control/core/editorSystem/Component';
import { renderRow } from './render';
import html from './template.html' with { type: 'text' };
import css  from './style.css'     with { type: 'text' };

/** Single clickable row in the pin popover. PinController flattens both
 *  single-value (toggle) and multi-value (one-row-per-value) syncs into this
 *  homogenous shape so the menu renders a flat list. */
export type PinMenuRow = {
    label:    string;
    isActive: boolean;
    onClick:  () => void;
};

const Metadata: ComponentMetadata = { css, template: html as unknown as string };

export class PinMenu extends Component {

    private _items!: HTMLElement;

    constructor() {
        super(Metadata);
        this._items = this.shadowRoot!.getElementById('items') as HTMLElement;
    }

    static create(rows: PinMenuRow[]): PinMenu {
        const menu = document.createElement('cms-bag-pin-menu') as PinMenu;
        menu.setRows(rows);
        return menu;
    }

    setRows(rows: PinMenuRow[]): void {
        this._items.innerHTML = '';
        for (const row of rows) this._items.appendChild(renderRow(row));
    }

    setPosition(left: number, top: number): void {
        this.style.left = `${left}px`;
        this.style.top  = `${top}px`;
    }
}

if (!customElements.get('cms-bag-pin-menu')) {
    customElements.define('cms-bag-pin-menu', PinMenu);
}

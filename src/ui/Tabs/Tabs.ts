import { Component } from "../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import "./TabPanel/TabPanel";

export class Tabs extends Component {

    private _tablist: HTMLElement | null;
    private _slot: HTMLSlotElement | null;

    static get observedAttributes() {
        return ['active'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._tablist = this.shadowRoot?.querySelector('.tablist') ?? null;
        this._slot = this.shadowRoot?.querySelector('slot') ?? null;
    }

    override connectedCallback() {
        this._slot?.addEventListener('slotchange', this._rebuild);
        this._tablist?.addEventListener('click', this._onTablistClick);
        this._tablist?.addEventListener('keydown', this._onKeydown);
        this._rebuild();
    }

    disconnectedCallback() {
        this._slot?.removeEventListener('slotchange', this._rebuild);
        this._tablist?.removeEventListener('click', this._onTablistClick);
        this._tablist?.removeEventListener('keydown', this._onKeydown);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (name === 'active' && newVal !== null) this._activate(newVal);
    }

    get active(): string { return this.getAttribute('active') ?? ''; }
    set active(v: string) { this.setAttribute('active', v); }

    private _panels(): HTMLElement[] {
        if (!this._slot) return [];
        return this._slot.assignedElements({ flatten: true })
            .filter(el => el.tagName === 'P9R-TAB-PANEL') as HTMLElement[];
    }

    private _rebuild = () => {
        if (!this._tablist) return;
        this._tablist.innerHTML = '';
        const panels = this._panels();
        let activeId = this.getAttribute('active');
        if (!activeId && panels.length > 0) activeId = panels[0]?.getAttribute('id') ?? null;

        panels.forEach((panel, i) => {
            const id = panel.getAttribute('id') ?? `tabpanel-${Tabs._uid++}`;
            if (!panel.id) panel.id = id;
            const labelAttr = panel.getAttribute('label') ?? `Tab ${i + 1}`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tab';
            btn.setAttribute('part', 'tab');
            btn.setAttribute('role', 'tab');
            btn.setAttribute('id', `tab-${id}`);
            btn.setAttribute('aria-controls', id);
            btn.dataset.target = id;
            btn.textContent = labelAttr;
            if (panel.hasAttribute('disabled')) btn.setAttribute('disabled', '');

            this._tablist!.appendChild(btn);

            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', `tab-${id}`);
        });

        if (activeId) this._activate(activeId);
    };

    private _activate(id: string) {
        const panels = this._panels();
        const tabs = Array.from(this._tablist?.querySelectorAll<HTMLButtonElement>('.tab') ?? []);
        let matched = false;

        panels.forEach(p => {
            const isMatch = p.id === id;
            if (isMatch) matched = true;
            p.toggleAttribute('hidden', !isMatch);
        });

        tabs.forEach(t => {
            const isMatch = t.dataset.target === id;
            t.setAttribute('aria-selected', String(isMatch));
            t.setAttribute('tabindex', isMatch ? '0' : '-1');
        });

        if (matched && this.getAttribute('active') !== id) {
            this.setAttribute('active', id);
            this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { active: id } }));
        }
    }

    private _onTablistClick = (e: Event) => {
        const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.tab');
        if (!target || target.hasAttribute('disabled')) return;
        const id = target.dataset.target;
        if (id) this._activate(id);
    };

    private _onKeydown = (e: KeyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const tabs = Array.from(this._tablist?.querySelectorAll<HTMLButtonElement>('.tab:not([disabled])') ?? []);
        if (tabs.length === 0) return;
        const current = tabs.findIndex(t => t === document.activeElement);
        const fallback = current === -1 ? 0 : current;
        let next = fallback;
        if (e.key === 'ArrowLeft')  next = (fallback - 1 + tabs.length) % tabs.length;
        if (e.key === 'ArrowRight') next = (fallback + 1) % tabs.length;
        if (e.key === 'Home')       next = 0;
        if (e.key === 'End')        next = tabs.length - 1;
        e.preventDefault();
        const target = tabs[next];
        if (!target) return;
        const id = target.dataset.target;
        if (id) this._activate(id);
        target.focus();
    };

    private static _uid = 0;
}

if (!customElements.get("p9r-tabs")) {
    customElements.define("p9r-tabs", Tabs);
}

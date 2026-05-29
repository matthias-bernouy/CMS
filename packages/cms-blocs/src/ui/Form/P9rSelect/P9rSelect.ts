import { Component } from "@bernouy/cms-blocs/base";
import template from './template.html' with { type: 'text' };
import baseCss from './base.css' with { type: 'text' };
import variantCss from './variant.css' with { type: 'text' };
const css = baseCss + variantCss;

import { setLabel } from './compute';
import { buildOptionList, setValue } from './domain/options';

export class P9rSelect extends Component {

    static formAssociated = true;

    private _internals: ElementInternals;
    private _trigger: HTMLElement | null;
    private _display: HTMLElement | null;
    private _list: HTMLElement | null;
    private _panel: HTMLElement | null;
    private _options: HTMLElement[] = [];
    private _value = '';
    private _isOpen = false;

    constructor() {
        super({ css, template: template as unknown as string });
        this._internals = this.attachInternals();
        this._trigger = this.shadowRoot!.querySelector('.trigger');
        this._display = this.shadowRoot!.querySelector('.value');
        this._list    = this.shadowRoot!.querySelector('.list');
        this._panel   = this.shadowRoot!.querySelector('.panel');
    }

    override connectedCallback() {
        setLabel(this.shadowRoot!.querySelector('.label'), this);
        const slot = this.shadowRoot!.querySelector('slot') as HTMLSlotElement;
        slot.addEventListener('slotchange', this._onSlot);
        // `beforetoggle` fires synchronously before the popover paints —
        // positioning here avoids the one-frame flash at top-left that
        // `toggle` (post-paint) leaves visible.
        this._panel?.addEventListener('beforetoggle', this._onBeforeToggle);
        this._panel?.addEventListener('toggle', this._onToggle);
        this._syncFromSlot();
    }

    disconnectedCallback() {
        const slot = this.shadowRoot!.querySelector('slot') as HTMLSlotElement | null;
        slot?.removeEventListener('slotchange', this._onSlot);
        this._panel?.removeEventListener('beforetoggle', this._onBeforeToggle);
        this._panel?.removeEventListener('toggle', this._onToggle);
        if (this._isOpen) (this._panel as any)?.hidePopover?.();
        this._unbindReposition();
    }

    private _syncFromSlot = () => {
        const { options, initialValue, initialLabel } = buildOptionList(this, this._list, (v, l) => this._select(v, l));
        this._options = options;

        const attrValue = this.getAttribute('value');
        if (attrValue !== null) {
            const li = options.find(o => o.dataset.value === attrValue);
            if (li) {
                this._setValue(attrValue, li.textContent ?? '');
                return;
            }
        }

        if (initialValue) this._setValue(initialValue, initialLabel);
    };

    private _select(value: string, label: string) {
        this._setValue(value, label);
        (this._panel as any)?.hidePopover?.();
        this.dispatchEvent(new Event('change', { bubbles: true }));
    }

    private _setValue(value: string, label: string) {
        this._value = value;
        this._internals.setFormValue(value);
        setValue(this._options, this._display, value, label);
    }

    /**
     * The panel is a top-layer popover (see template.html / variant.css):
     * its containing block is always the viewport, so trigger
     * `getBoundingClientRect()` coords land in the right reference frame
     * even when an ancestor uses `transform` / `filter` / `contain`.
     * Native `popovertarget` on the trigger handles open/close — we just
     * pre-position on `beforetoggle` (so the first paint already lands at
     * the right spot, no flash) and bind scroll/resize follow on `toggle`.
     */
    private _onBeforeToggle = (e: Event) => {
        if ((e as ToggleEvent).newState === 'open') this._reposition();
    };

    private _onToggle = (e: Event) => {
        this._isOpen = (e as ToggleEvent).newState === 'open';
        if (this._isOpen) {
            window.addEventListener('scroll', this._reposition, { capture: true, passive: true });
            window.addEventListener('resize', this._reposition);
        } else {
            this._unbindReposition();
        }
    };

    private _unbindReposition() {
        window.removeEventListener('scroll', this._reposition, { capture: true } as any);
        window.removeEventListener('resize', this._reposition);
    }

    private _reposition = () => {
        if (!this._trigger || !this._panel) return;
        const rect = this._trigger.getBoundingClientRect();
        this._panel.style.top   = `${rect.bottom + 4}px`;
        this._panel.style.left  = `${rect.left}px`;
        this._panel.style.width = `${rect.width}px`;
    };

    get value() { return this._value; }
    set value(v: string) {
        const li = this._options.find(o => o.dataset.value === v);
        if (li) this._setValue(v, li.textContent ?? '');
    }

    get name() { return this.getAttribute('name'); }

    private _onSlot = () => this._syncFromSlot();
}

if (!customElements.get("p9r-select")) {
    customElements.define("p9r-select", P9rSelect);
}

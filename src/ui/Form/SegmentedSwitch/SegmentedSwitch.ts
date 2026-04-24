import { Component } from "../../../base/Component";
import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class SegmentedSwitch extends Component {
    static formAssociated = true;
    private _internals: ElementInternals;
    private _slider: HTMLElement | null;
    private _optionsContainer: HTMLElement | null;
    private _labelEl: HTMLElement | null;
    private _slot: HTMLSlotElement | null;
    private _optionCount: number = 0;

    static get observedAttributes() {
        return ['value', 'disabled', 'name', 'label'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._internals = this.attachInternals();
        this._slider = this.shadowRoot?.querySelector('.selection-slider') ?? null;
        this._optionsContainer = this.shadowRoot?.querySelector('.options-container') ?? null;
        this._labelEl = this.shadowRoot?.querySelector('.label') ?? null;
        this._slot = this.shadowRoot?.querySelector('slot:not([name])') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['value', 'disabled', 'name', 'label']) {
            this._upgradeProperty(prop);
        }

        if (this._slot) {
            this._slot.addEventListener('slotchange', this._handleSlotChange);
            // `slotchange` does NOT fire when the element is upgraded with
            // pre-existing light-DOM children (or on reconnect) — sync now so
            // --total-options, click handlers, and slider position are set.
            this._syncOptions();
        }

        this.addEventListener('keydown', this._handleKeydown);

        this._updateLabel();
    }

    disconnectedCallback() {
        if (this._slot) {
            this._slot.removeEventListener('slotchange', this._handleSlotChange);
        }
        this.removeEventListener('keydown', this._handleKeydown);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this.shadowRoot) return;
        if (name === 'value') this.value = newVal ?? "";
        else if (name === 'label') this._updateLabel();
    }

    get value() { return this.getAttribute('value') || ""; }
    set value(v: string) {
        // Compare against the raw attribute (not the getter) so that the
        // "already synced" check only short-circuits setAttribute — avoiding
        // the attributeChangedCallback → setter → setAttribute loop. The
        // side effects below must always run, otherwise an upgrade with a
        // pre-set `value` attribute would silently skip form registration
        // and slider positioning.
        if (this.getAttribute('value') !== v) this.setAttribute('value', v);
        this._internals.setFormValue(v);
        this._updateSliderPosition();
        this._updateSlottedSelections(v);

        this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: v } }));
    }

    get name() { return this.getAttribute('name') || ""; }
    set name(v: string) {
        if (v) this.setAttribute('name', v);
        else this.removeAttribute('name');
    }

    get disabled() {
        return this.hasAttribute('disabled');
    }

    set disabled(val: boolean) {
        if (val) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get label() { return this.getAttribute('label') || ""; }
    set label(v: string) {
        if (v) this.setAttribute('label', v);
        else this.removeAttribute('label');
    }

    private _upgradeProperty(prop: string) {
        if (this.hasOwnProperty(prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    private _updateLabel() {
        if (this._labelEl) this._labelEl.textContent = this.getAttribute('label') || '';
    }

    private _getOptions(): Element[] {
        if (!this._slot) return [];
        return this._slot.assignedElements().filter(el => el.tagName === 'OPTION');
    }

    private _handleSlotChange = () => {
        this._syncOptions();
    };

    private _syncOptions() {
        const options = this._getOptions();
        this._optionCount = options.length;
        this.style.setProperty('--total-options', this._optionCount.toString());

        options.forEach((opt, i) => {
            opt.setAttribute('role', 'radio');
            opt.setAttribute('part', 'segment');
            if (!opt.hasAttribute('tabindex')) {
                opt.setAttribute('tabindex', i === 0 ? '0' : '-1');
            }
            (opt as HTMLElement).onclick = () => {
                if (this.disabled) return;
                this.value = opt.getAttribute('value') || "";
                (opt as HTMLElement).focus();
            };
        });

        this._updateSliderPosition();
        // If the value was set before the options were attached (e.g. via
        // an attribute on the tag before appendChild), the earlier call to
        // `_updateSlottedSelections` found nothing to mark. Re-run it now
        // that the options are assigned.
        this._updateSlottedSelections(this.value);
    }

    private _handleKeydown = (e: KeyboardEvent) => {
        if (this.disabled) return;
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (!keys.includes(e.key)) return;

        const options = this._getOptions();
        if (options.length === 0) return;

        const currentIndex = options.findIndex(opt => opt.getAttribute('value') === this.value);
        const fallback = currentIndex === -1 ? 0 : currentIndex;
        let nextIndex = fallback;

        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                nextIndex = (fallback - 1 + options.length) % options.length;
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                nextIndex = (fallback + 1) % options.length;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = options.length - 1;
                break;
        }

        e.preventDefault();
        const next = options[nextIndex];
        if (!next) return;
        this.value = next.getAttribute('value') || "";
        (next as HTMLElement).focus();
    };

    private _updateSliderPosition() {
        const options = this._getOptions();
        const index = options.findIndex(opt => opt.getAttribute('value') === this.value);

        if (index !== -1) {
            this.style.setProperty('--active-index', index.toString());
            options.forEach((opt, i) => {
                const checked = i === index;
                opt.setAttribute('aria-checked', checked.toString());
                opt.setAttribute('tabindex', checked ? '0' : '-1');
            });
        }
    }

    private _updateSlottedSelections(selectedValue: string) {
        const options = this._getOptions();

        options.forEach(opt => {
            if (opt.getAttribute('value') === selectedValue) {
                opt.setAttribute('selected', '');
            } else {
                opt.removeAttribute('selected');
            }
        });
    }
}

if (!customElements.get("p9r-segmented-switch")) {
    customElements.define("p9r-segmented-switch", SegmentedSwitch);
}

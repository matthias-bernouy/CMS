import { Component } from "../../../base/Component";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export class Textarea extends Component {

    static formAssociated = true;
    private _internals: ElementInternals;
    private _textarea: HTMLTextAreaElement | null;
    private _label: HTMLLabelElement | null;
    private _hint: HTMLElement | null;
    private _meta: HTMLElement | null;
    private _counter: HTMLElement | null;
    private _count: HTMLElement | null;
    private _max: HTMLElement | null;

    static get observedAttributes() {
        return [
            'value', 'label', 'placeholder', 'rows', 'maxlength', 'max-count',
            'hint', 'hint-level', 'invalid', 'disabled', 'required', 'autosize',
        ];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
        this._internals = this.attachInternals();
        this._textarea = this.shadowRoot?.querySelector('textarea') ?? null;
        this._label = this.shadowRoot?.querySelector('.label') ?? null;
        this._hint = this.shadowRoot?.querySelector('.hint') ?? null;
        this._meta = this.shadowRoot?.querySelector('.meta') ?? null;
        this._counter = this.shadowRoot?.querySelector('.counter') ?? null;
        this._count = this.shadowRoot?.querySelector('.count') ?? null;
        this._max = this.shadowRoot?.querySelector('.max') ?? null;
    }

    override connectedCallback() {
        for (const prop of ['value', 'disabled', 'required']) this._upgradeProperty(prop);

        this._textarea?.addEventListener('input', this._onInput);
        this._textarea?.addEventListener('change', this._onChange);

        this._syncLabel();
        this._syncPlaceholder();
        this._syncRows();
        this._syncMaxLength();
        this._syncDisabled();
        this._syncRequired();
        this._syncHint();
        this._syncHintLevel();
        this._syncInvalid();
        this._syncMaxCount();

        const initial = this.getAttribute('value');
        if (initial !== null) this.value = initial;
        else this._updateCounter();
    }

    disconnectedCallback() {
        this._textarea?.removeEventListener('input', this._onInput);
        this._textarea?.removeEventListener('change', this._onChange);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._textarea) return;
        switch (name) {
            case 'value':       if (newVal !== null) this.value = newVal; break;
            case 'label':       this._syncLabel(); break;
            case 'placeholder': this._syncPlaceholder(); break;
            case 'rows':        this._syncRows(); break;
            case 'maxlength':   this._syncMaxLength(); break;
            case 'disabled':    this._syncDisabled(); break;
            case 'required':    this._syncRequired(); break;
            case 'hint':        this._syncHint(); break;
            case 'hint-level':  this._syncHintLevel(); break;
            case 'invalid':     this._syncInvalid(); break;
            case 'max-count':   this._syncMaxCount(); this._updateCounter(); break;
            case 'autosize':    this._autosize(); break;
        }
    }

    get value(): string { return this._textarea?.value ?? ''; }
    set value(v: string) {
        if (!this._textarea) return;
        this._textarea.value = v;
        this._internals.setFormValue(v);
        this._updateCounter();
        this._autosize();
    }

    get name(): string { return this.getAttribute('name') ?? ''; }

    get disabled(): boolean { return this._textarea?.disabled ?? false; }
    set disabled(v: boolean) {
        if (v) this.setAttribute('disabled', '');
        else this.removeAttribute('disabled');
    }

    get required(): boolean { return this.hasAttribute('required'); }
    set required(v: boolean) {
        if (v) this.setAttribute('required', '');
        else this.removeAttribute('required');
    }

    override focus() { this._textarea?.focus(); }

    private _onInput = () => {
        if (!this._textarea) return;
        this._internals.setFormValue(this._textarea.value);
        this._updateCounter();
        this._autosize();
    };

    private _onChange = () => {
        if (!this._textarea) return;
        this._internals.setFormValue(this._textarea.value);
    };

    private _syncLabel() {
        if (!this._label) return;
        const text = this.getAttribute('label') ?? '';
        this._label.textContent = text;
        this._label.hidden = text === '';
    }

    private _syncPlaceholder() {
        if (!this._textarea) return;
        const v = this.getAttribute('placeholder');
        if (v === null) this._textarea.removeAttribute('placeholder');
        else this._textarea.setAttribute('placeholder', v);
    }

    private _syncRows() {
        if (!this._textarea) return;
        const r = this.getAttribute('rows');
        if (r) this._textarea.rows = Number(r) || 3;
    }

    private _syncMaxLength() {
        if (!this._textarea) return;
        const v = this.getAttribute('maxlength');
        if (v === null) this._textarea.removeAttribute('maxlength');
        else this._textarea.setAttribute('maxlength', v);
    }

    private _syncDisabled() {
        if (!this._textarea) return;
        this._textarea.disabled = this.hasAttribute('disabled');
    }

    private _syncRequired() {
        if (!this._textarea) return;
        const required = this.hasAttribute('required');
        this._textarea.required = required;
        if (required) this._textarea.setAttribute('aria-required', 'true');
        else this._textarea.removeAttribute('aria-required');
    }

    private _syncHint() {
        if (!this._hint) return;
        this._hint.textContent = this.getAttribute('hint') ?? '';
        this._refreshMetaVisibility();
    }

    private _syncHintLevel() {
        if (!this._hint) return;
        const level = this.getAttribute('hint-level') ?? 'info';
        this._hint.dataset.level = level;
    }

    private _syncInvalid() {
        if (!this._textarea) return;
        if (this.hasAttribute('invalid')) this._textarea.setAttribute('aria-invalid', 'true');
        else this._textarea.removeAttribute('aria-invalid');
    }

    private _syncMaxCount() {
        if (!this._counter || !this._max) return;
        const max = this._parseMaxCount();
        if (max === null) this._counter.hidden = true;
        else {
            this._counter.hidden = false;
            this._max.textContent = String(max);
        }
        this._refreshMetaVisibility();
    }

    private _parseMaxCount(): number | null {
        const raw = this.getAttribute('max-count');
        if (raw === null) return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    private _updateCounter() {
        if (!this._textarea || !this._counter || !this._count) return;
        const max = this._parseMaxCount();
        if (max === null) return;
        const len = this._textarea.value.length;
        this._count.textContent = String(len);
        this._counter.dataset.over = String(len > max);
    }

    private _refreshMetaVisibility() {
        if (!this._hint || !this._counter || !this._meta) return;
        const hasHint = (this._hint.textContent ?? '').length > 0;
        const hasCounter = !this._counter.hidden;
        this._meta.hidden = !hasHint && !hasCounter;
    }

    private _autosize() {
        if (!this._textarea || !this.hasAttribute('autosize')) return;
        this._textarea.style.height = 'auto';
        this._textarea.style.height = `${this._textarea.scrollHeight}px`;
    }

    private _upgradeProperty(prop: string) {
        if (Object.prototype.hasOwnProperty.call(this, prop)) {
            const value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }
}

if (!customElements.get("p9r-textarea")) {
    customElements.define("p9r-textarea", Textarea);
}

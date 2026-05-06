import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {

    static observedAttributes = ['action', 'method', 'enctype', 'autocomplete', 'novalidate', 'target'];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const form = this.shadowRoot!.querySelector('form') as HTMLFormElement | null;
        if (!form) return;

        this._syncFormAttrs(form);

        form.addEventListener('submit', this._onSubmit);

        this.addEventListener('click', this._onHostClick);
    }

    disconnectedCallback(): void {
        const form = this.shadowRoot!.querySelector('form') as HTMLFormElement | null;
        form?.removeEventListener('submit', this._onSubmit);
        this.removeEventListener('click', this._onHostClick);
    }

    attributeChangedCallback() {
        const form = this.shadowRoot?.querySelector('form') as HTMLFormElement | null;
        if (form) this._syncFormAttrs(form);
    }

    private _syncFormAttrs(form: HTMLFormElement) {
        for (const name of ['action', 'method', 'enctype', 'autocomplete', 'target']) {
            const value = this.getAttribute(name);
            if (value) form.setAttribute(name, value);
            else form.removeAttribute(name);
        }
        if (this.hasAttribute('novalidate')) form.setAttribute('novalidate', '');
        else form.removeAttribute('novalidate');
    }

    private _onSubmit = (e: SubmitEvent) => {
        const form = e.target as HTMLFormElement;
        const values: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

        this._collectLightValues(values);

        this.dispatchEvent(new CustomEvent('hub-form-submit', {
            bubbles: true,
            composed: true,
            detail: { values, form, native: e },
        }));
    };

    private _collectLightValues(out: Record<string, FormDataEntryValue | FormDataEntryValue[]>) {
        const named = this.querySelectorAll<HTMLElement>('[name]');
        named.forEach(el => {
            const name = el.getAttribute('name');
            if (!name) return;
            const anyEl = el as any;
            const value = anyEl.value ?? el.getAttribute('value') ?? '';
            if (name in out) {
                const prev = out[name];
                out[name] = Array.isArray(prev) ? [...prev, value] : [prev as FormDataEntryValue, value];
            } else {
                out[name] = value;
            }
        });
    }

    private _onHostClick = (e: MouseEvent) => {
        const path = e.composedPath();
        for (const node of path) {
            if (!(node instanceof HTMLElement)) continue;
            if (node === this) break;
            const type = node.getAttribute?.('type');
            if (!type) continue;
            if (type === 'submit') {
                this._requestSubmit();
                return;
            }
            if (type === 'reset') {
                const form = this.shadowRoot!.querySelector('form') as HTMLFormElement | null;
                form?.reset();
                this.querySelectorAll<HTMLElement>('[name]').forEach(el => {
                    const anyEl = el as any;
                    if ('value' in anyEl) anyEl.value = anyEl.defaultValue ?? '';
                    if ('checked' in anyEl) anyEl.checked = !!anyEl.defaultChecked;
                });
                return;
            }
        }
    };

    private _requestSubmit() {
        const form = this.shadowRoot!.querySelector('form') as HTMLFormElement | null;
        if (!form) return;
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    }
}

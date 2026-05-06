import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms/component';

export class Bloc extends Component {
    static observedAttributes = ['min', 'max', 'step', 'unit', 'value-min', 'value-max', 'label'];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        const minInput = this.shadowRoot!.querySelector('.input-min') as HTMLInputElement;
        const maxInput = this.shadowRoot!.querySelector('.input-max') as HTMLInputElement;
        minInput.addEventListener('input', this._onChange);
        maxInput.addEventListener('input', this._onChange);
        this._sync();
    }

    disconnectedCallback(): void {
        const minInput = this.shadowRoot!.querySelector('.input-min') as HTMLInputElement;
        const maxInput = this.shadowRoot!.querySelector('.input-max') as HTMLInputElement;
        minInput?.removeEventListener('input', this._onChange);
        maxInput?.removeEventListener('input', this._onChange);
    }

    attributeChangedCallback() {
        if (this.shadowRoot) this._sync();
    }

    private _onChange = () => {
        const minInput = this.shadowRoot!.querySelector('.input-min') as HTMLInputElement;
        const maxInput = this.shadowRoot!.querySelector('.input-max') as HTMLInputElement;
        let lo = Number(minInput.value);
        let hi = Number(maxInput.value);
        if (lo > hi) [lo, hi] = [hi, lo];
        this.setAttribute('value-min', String(lo));
        this.setAttribute('value-max', String(hi));
        this._sync();
        this.dispatchEvent(new CustomEvent('change', {
            detail: { min: lo, max: hi },
            bubbles: true,
        }));
    };

    private _sync() {
        const root = this.shadowRoot!;
        const min = Number(this.getAttribute('min') ?? 0);
        const max = Number(this.getAttribute('max') ?? 100);
        const lo = Number(this.getAttribute('value-min') ?? min);
        const hi = Number(this.getAttribute('value-max') ?? max);
        const unit = this.getAttribute('unit') ?? '';
        const label = this.getAttribute('label') ?? '';

        const minInput = root.querySelector('.input-min') as HTMLInputElement;
        const maxInput = root.querySelector('.input-max') as HTMLInputElement;
        const range = root.querySelector('.range') as HTMLElement;
        const labelEl = root.querySelector('.label') as HTMLElement;

        minInput.min = String(min); minInput.max = String(max); minInput.value = String(lo);
        maxInput.min = String(min); maxInput.max = String(max); maxInput.value = String(hi);

        const span = max - min || 1;
        const left  = ((lo - min) / span) * 100;
        const right = ((hi - min) / span) * 100;
        range.style.setProperty('--lo', left + '%');
        range.style.setProperty('--hi', right + '%');

        labelEl.textContent = `${label ? label + ' : ' : ''}${lo}${unit} — ${hi}${unit}`;
    }
}

import { Component } from "@bernouy/cms-blocs/base";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import "./Step/Step";

export class Stepper extends Component {

    static get observedAttributes() {
        return ['current', 'orientation'];
    }

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        this._sync();
    }

    attributeChangedCallback(_name: string, _oldVal: string | null, _newVal: string | null) {
        this._sync();
    }

    get current(): number {
        const n = parseInt(this.getAttribute('current') ?? '', 10);
        return Number.isFinite(n) ? n : 0;
    }

    set current(v: number) { this.setAttribute('current', String(v)); }

    private _steps(): HTMLElement[] {
        return Array.from(this.querySelectorAll('p9r-step')) as HTMLElement[];
    }

    private _sync() {
        const orientation = this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal';
        const current = this.current;
        const steps = this._steps();
        steps.forEach((step, i) => {
            step.setAttribute('data-index', String(i + 1));
            step.setAttribute('orientation', orientation);
            const isLast = i === steps.length - 1;
            if (isLast) step.setAttribute('last', '');
            else step.removeAttribute('last');

            if (step.hasAttribute('state')) return;
            if (i < current)        step.setAttribute('data-state', 'completed');
            else if (i === current) step.setAttribute('data-state', 'active');
            else                    step.setAttribute('data-state', 'pending');
        });
    }
}

if (!customElements.get("p9r-stepper")) {
    customElements.define("p9r-stepper", Stepper);
}

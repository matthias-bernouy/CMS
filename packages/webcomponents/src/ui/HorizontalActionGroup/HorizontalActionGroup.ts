import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from "../../base/Component";

export class HorizontalActionGroup extends Component {

    static _event = "action-click";

    private _toolbar: HTMLElement | null;

    constructor() {
        super({
            css,
            template: template as unknown as string
        });
        this._toolbar = this.shadowRoot?.querySelector('.actions') ?? null;
    }

    static get observedAttributes() {
        return ['label'];
    }

    override connectedCallback() {
        for (const prop of ['label']) {
            this._upgradeProperty(prop);
        }

        if (this._toolbar && !this._toolbar.hasAttribute('aria-label')) {
            const label = this.getAttribute('label');
            if (label) this._toolbar.setAttribute('aria-label', label);
        }

        this.addEventListener('click', this._handleClick);
    }

    disconnectedCallback() {
        this.removeEventListener('click', this._handleClick);
    }

    attributeChangedCallback(name: string, _oldVal: string | null, newVal: string | null) {
        if (!this._toolbar) return;
        if (name === 'label') {
            if (newVal === null) this._toolbar.removeAttribute('aria-label');
            else this._toolbar.setAttribute('aria-label', newVal);
        }
    }

    private _handleClick = (e: Event) => {
        const path = e.composedPath();
        const actionItem = path.find(
            (n): n is Element => n instanceof Element && n.hasAttribute('data-action')
        );

        if (!actionItem) return;

        e.stopPropagation();
        const actionName = actionItem.getAttribute('data-action');
        this._dispatchAction(actionName, actionItem, e);
    };

    private _dispatchAction(name: string | null, element: Element, originalEvent: Event) {
        this.dispatchEvent(new CustomEvent('action-click', {
            detail: {
                action: name,
                originalEvent,
                target: element
            },
            bubbles: true,
            composed: true
        }));
    }

    private _upgradeProperty(prop: string) {
        if (this.hasOwnProperty(prop)) {
            let value = (this as any)[prop];
            delete (this as any)[prop];
            (this as any)[prop] = value;
        }
    }

    get label() {
        return this.getAttribute('label');
    }

    set label(val: string | null) {
        if (val === null) this.removeAttribute('label');
        else this.setAttribute('label', val);
    }
}

if (!customElements.get("p9r-horizontal-action-group")) {
    customElements.define("p9r-horizontal-action-group", HorizontalActionGroup);
}

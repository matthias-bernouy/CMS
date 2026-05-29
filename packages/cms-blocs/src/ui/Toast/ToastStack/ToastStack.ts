import { Component } from "../../../base/Component";
import { Toast, type ToastType } from "../Toast/Toast";

import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

import "../Toast/Toast";

export type ToastOptions = {
    type?: ToastType;
    duration?: number;
};

export class ToastStack extends Component {

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback() {
        if (!this.hasAttribute('popover')) this.setAttribute('popover', 'manual');
        try { (this as any).showPopover?.(); } catch { /* already shown */ }
    }

    push(message: string, options: ToastOptions = {}): Toast {
        const toast = document.createElement('p9r-toast') as Toast;
        toast.setAttribute('type', options.type ?? 'info');
        if (options.duration !== undefined) {
            toast.setAttribute('duration', String(options.duration));
        }
        toast.textContent = message;
        this.appendChild(toast);
        return toast;
    }
}

if (!customElements.get("p9r-toast-stack")) {
    customElements.define("p9r-toast-stack", ToastStack);
}

let _stack: ToastStack | null = null;

function ensureStack(): ToastStack {
    if (_stack && _stack.isConnected) return _stack;
    _stack = document.querySelector('p9r-toast-stack') as ToastStack | null;
    if (_stack) return _stack;
    _stack = document.createElement('p9r-toast-stack') as ToastStack;
    document.body.appendChild(_stack);
    return _stack;
}

export function showToast(message: string, options: ToastOptions = {}): Toast {
    return ensureStack().push(message, options);
}

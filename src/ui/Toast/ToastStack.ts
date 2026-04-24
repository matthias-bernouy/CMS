import { Component } from "../../base/Component";
import { Toast, type ToastType } from "./Toast";

import template from './ToastStack.template.html' with { type: 'text' };
import css from './ToastStack.style.css' with { type: 'text' };

import "./Toast";

export type ToastOptions = {
    type?: ToastType;
    duration?: number;
};

/**
 * Fixed-position container for <p9r-toast>. Usually created lazily by the
 * `showToast()` helper — no need to hand-place it in HTML.
 */
export class ToastStack extends Component {

    constructor() {
        super({
            css,
            template: template as unknown as string,
        });
    }

    override connectedCallback() {
        // Promote the stack into the top-layer so backdrop-filter blurs from
        // sibling <dialog> elements don't affect it. `manual` means we control
        // show/hide ourselves — it never auto-closes on outside click.
        if (!this.hasAttribute('popover')) {
            this.setAttribute('popover', 'manual');
        }
        try { (this as any).showPopover?.(); } catch { /* already shown */ }
    }

    push(message: string, options: ToastOptions = {}): Toast {
        const toast = document.createElement("p9r-toast") as Toast;
        toast.setAttribute("type", options.type ?? "info");
        if (options.duration !== undefined) {
            toast.setAttribute("duration", String(options.duration));
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
    _stack = document.querySelector("p9r-toast-stack") as ToastStack | null;
    if (_stack) return _stack;

    _stack = document.createElement("p9r-toast-stack") as ToastStack;
    document.body.appendChild(_stack);
    return _stack;
}

/**
 * Show a toast notification. Creates a <p9r-toast-stack> on first call if
 * none exists in the document.
 *
 * @example
 * showToast("Page saved", { type: "success" });
 * showToast("Failed to save", { type: "error" });
 */
export function showToast(message: string, options: ToastOptions = {}): Toast {
    return ensureStack().push(message, options);
}

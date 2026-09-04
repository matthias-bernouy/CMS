import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

/**
 * `<base-button>` — renders a real link in link mode when `href` is set,
 * and a `<button type="button|submit">` otherwise. The legacy "anchor as
 * button" pattern confuses assistive tech AND the editor's link interceptor
 * (which swallows every `<a>` click in view mode); swapping to a real button
 * for non-link actions matches semantics and lets click events bubble
 * normally to ancestor handlers like `<base-form>`'s submit interception.
 *
 * The template ships an `<a>` placeholder — connectedCallback replaces it
 * with a `<button>` on mount when no href is set, preserving class/part
 * attributes and slotted children.
 */
export class Bloc extends Component {
    static formAssociated = true;
    static observedAttributes = ["href", "target", "type", "name", "value", "disabled"];

    private _internals: ElementInternals | null = null;
    private _formDisabled = false;

    constructor() {
        super({ css, template: template as unknown as string });
        if (typeof this.attachInternals === "function") {
            this._internals = this.attachInternals();
        }
    }

    override connectedCallback(): void {
        this.shadowRoot?.addEventListener("click", this._onShadowClick);
        this._sync();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this._onShadowClick);
    }

    attributeChangedCallback(name: string, _oldValue: string | null, value: string | null) {
        if (name === "disabled" && (value === "no" || value === "false")) {
            this.removeAttribute("disabled");
            return;
        }
        this._sync();
    }

    formDisabledCallback(disabled: boolean): void {
        this._formDisabled = disabled;
        this._sync();
    }

    override focus(): void {
        this._control()?.focus();
    }

    override click(): void {
        const control = this._control();
        if (control) {
            control.click();
            return;
        }
        HTMLElement.prototype.click.call(this);
    }

    get name(): string {
        return this.getAttribute("name") ?? "";
    }

    set name(value: string) {
        this.setAttribute("name", value);
    }

    get value(): string {
        return this.getAttribute("value") ?? "";
    }

    set value(value: string) {
        this.setAttribute("value", value);
    }

    get disabled(): boolean {
        if (this._formDisabled) {
            return true;
        }
        const value = this.getAttribute("disabled");
        return value !== null && value !== "no" && value !== "false";
    }

    set disabled(value: boolean) {
        if (value) {
            this.setAttribute("disabled", "yes");
        } else {
            this.removeAttribute("disabled");
        }
    }

    private _sync() {
        const root = this.shadowRoot;
        if (!root) {
            return;
        }
        let el = root.querySelector(".cta") as HTMLElement | null;
        if (!el) {
            return;
        }

        const href = this.getAttribute("href");
        const target = this.getAttribute("target");
        const type = this.getAttribute("type");
        const name = this.getAttribute("name");
        const value = this.getAttribute("value");
        const action = type === "link" || type === "button" || type === "submit" ? type : href ? "link" : "button";

        const wantTag = action === "link" && href ? "a" : "button";
        if (el.tagName.toLowerCase() !== wantTag) {
            const next = document.createElement(wantTag);
            for (const attr of Array.from(el.attributes)) {
                next.setAttribute(attr.name, attr.value);
            }
            while (el.firstChild) {
                next.appendChild(el.firstChild);
            }
            el.parentNode!.replaceChild(next, el);
            el = next;
        }

        if (wantTag === "a") {
            if (href) {
                el.setAttribute("href", href);
            } else {
                el.removeAttribute("href");
            }
            if (target && target !== "_self") {
                el.setAttribute("target", target);
            } else {
                el.removeAttribute("target");
            }
            if (target === "_blank") {
                el.setAttribute("rel", "noopener noreferrer");
            } else {
                el.removeAttribute("rel");
            }
            el.removeAttribute("type");
            el.removeAttribute("name");
            el.removeAttribute("value");
            el.removeAttribute("disabled");
        } else {
            // <button> without explicit type defaults to "submit" per HTML
            // spec — undesired here since the user opts in via type="submit".
            // Default to "button" otherwise so clicks don't surprise-submit.
            el.setAttribute("type", action === "submit" ? "submit" : "button");
            if (el instanceof HTMLButtonElement) {
                el.disabled = this.disabled;
            }
            if (action === "submit" && name !== null) {
                el.setAttribute("name", name);
            } else {
                el.removeAttribute("name");
            }
            if (action === "submit" && value !== null) {
                el.setAttribute("value", value);
            } else {
                el.removeAttribute("value");
            }
            el.removeAttribute("href");
            el.removeAttribute("target");
            el.removeAttribute("rel");
        }
    }

    private _control(): HTMLElement | null {
        return this.shadowRoot?.querySelector<HTMLElement>(".cta") ?? null;
    }

    private _actionType(): "link" | "button" | "submit" {
        const type = this.getAttribute("type");
        if (type === "link" || type === "button" || type === "submit") {
            return type;
        }
        return this.hasAttribute("href") ? "link" : "button";
    }

    private _form(): HTMLFormElement | null {
        const internalsForm = this._internals?.form;
        if (internalsForm) {
            return internalsForm;
        }

        const formId = this.getAttribute("form")?.trim();
        if (formId) {
            const form = this.ownerDocument.getElementById(formId);
            if (this._isForm(form)) {
                return form;
            }
        }

        return this.closest("form");
    }

    private _isForm(element: Element | null): element is HTMLFormElement {
        const FormCtor = this.ownerDocument.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
        return typeof FormCtor === "function" && element instanceof FormCtor;
    }

    private _onShadowClick = (event: Event): void => {
        if (this._actionType() !== "submit") {
            return;
        }
        if (this.disabled) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        queueMicrotask(() => {
            if (event.defaultPrevented || !this.isConnected) {
                return;
            }
            this._submitForm();
        });
    };

    private _submitForm(): void {
        const form = this._form();
        if (!form) {
            return;
        }
        if (!form.noValidate && typeof form.reportValidity === "function" && !form.reportValidity()) {
            return;
        }

        const submitterValue = this._submitterValue(form);
        const nativeSubmitter = this._nativeSubmitter(form);
        let submitDispatched = false;
        const markSubmitDispatched = (): void => {
            submitDispatched = true;
        };

        form.addEventListener("submit", markSubmitDispatched, { capture: true, once: true });
        try {
            nativeSubmitter.click();
            if (!submitDispatched) {
                this._dispatchSubmitFallback(form);
            }
        } finally {
            form.removeEventListener("submit", markSubmitDispatched, { capture: true });
            nativeSubmitter.remove();
            submitterValue?.remove();
        }
    }

    private _submitterValue(form: HTMLFormElement): HTMLInputElement | null {
        const name = this.name.trim();
        if (!name) {
            return null;
        }

        const input = form.ownerDocument.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = this.value;
        input.setAttribute("data-base-button-submitter", "");
        form.append(input);
        return input;
    }

    private _nativeSubmitter(form: HTMLFormElement): HTMLButtonElement {
        const button = form.ownerDocument.createElement("button");
        button.type = "submit";
        button.hidden = true;
        button.tabIndex = -1;
        button.setAttribute("aria-hidden", "true");
        button.setAttribute("data-base-button-native-submitter", "");
        form.append(button);
        return button;
    }

    private _dispatchSubmitFallback(form: HTMLFormElement): void {
        const SubmitEventCtor = form.ownerDocument.defaultView?.SubmitEvent ?? globalThis.SubmitEvent;
        const event =
            typeof SubmitEventCtor === "function"
                ? new SubmitEventCtor("submit", { bubbles: true, cancelable: true, submitter: this })
                : new Event("submit", { bubbles: true, cancelable: true });
        if (form.dispatchEvent(event) && typeof form.submit === "function") {
            form.submit();
        }
    }
}

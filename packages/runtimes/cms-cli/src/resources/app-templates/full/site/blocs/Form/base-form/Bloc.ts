import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

const FORM_SUBMIT_EVENT = "base-form-submit";
const FORM_SUCCESS_EVENT = "base-form-success";
const FORM_ERROR_EVENT = "base-form-error";

export type BaseFormSubmitDetail = {
    endpoint: string | null;
    form: HTMLFormElement;
    data: Record<string, FormDataEntryValue | FormDataEntryValue[]>;
    formData: FormData;
    method: string;
    redirect: string | null;
};

export type BaseFormSuccessDetail = BaseFormSubmitDetail & {
    response: Response;
    body: unknown;
};

export type BaseFormErrorDetail = BaseFormSubmitDetail & {
    response: Response | null;
    body: unknown;
    error: unknown;
};

type BaseSearchInputElement = HTMLElement & {
    name: string;
    value: string;
    disabled: boolean;
    reportValidity(): boolean;
};

type BaseFormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | BaseSearchInputElement;

export class Bloc extends Component {
    private _form: HTMLFormElement | null = null;
    private _isSubmitting = false;

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._form = this.shadowRoot?.querySelector<HTMLFormElement>("form") ?? null;
        this._form?.addEventListener("submit", this._onSubmit);
        this.addEventListener("click", this._onClick);
        this.addEventListener("keydown", this._onKeyDown);
        this._populateControlsFromUrl();
    }

    disconnectedCallback(): void {
        this._form?.removeEventListener("submit", this._onSubmit);
        this.removeEventListener("click", this._onClick);
        this.removeEventListener("keydown", this._onKeyDown);
        this._form = null;
    }

    private readonly _onSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        void this._submit();
    };

    private readonly _onClick = (event: MouseEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        const submit = target?.closest("button, input");
        if (!submit || !this.contains(submit) || !this._isSubmitControl(submit)) return;

        event.preventDefault();
        void this._submit();
    };

    private readonly _onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Enter" || event.defaultPrevented || event.isComposing) return;

        if (!this._isEnterSubmitTarget(event.target)) return;

        event.preventDefault();
        void this._submit();
    };

    private async _submit(): Promise<void> {
        if (!this._form || this._isSubmitting || !this._isValid()) return;

        this._clearState();
        const detail = this._submitDetail();
        const submitEvent = new CustomEvent<BaseFormSubmitDetail>(FORM_SUBMIT_EVENT, {
            bubbles: true,
            cancelable: true,
            composed: true,
            detail,
        });

        const shouldContinue = this.dispatchEvent(submitEvent);
        if (!shouldContinue || !detail.endpoint) return;

        this._isSubmitting = true;
        this._setState("loading");
        this._setControlsDisabled(true);

        try {
            const response = await this._send(detail);
            const body = await this._readResponseBody(response);

            if (!response.ok) {
                this._fail(detail, response, body, new Error(response.statusText || `Request failed (${response.status})`));
                return;
            }

            this._setState("loaded");
            const successEvent = new CustomEvent<BaseFormSuccessDetail>(FORM_SUCCESS_EVENT, {
                bubbles: true,
                cancelable: true,
                composed: true,
                detail: { ...detail, response, body },
            });
            const shouldRedirect = this.dispatchEvent(successEvent);

            if (shouldRedirect && detail.redirect) {
                this._redirectTo(detail.redirect);
            }
        } catch (error) {
            this._fail(detail, null, null, error);
        } finally {
            this._isSubmitting = false;
            this._setControlsDisabled(false);
        }
    }

    private _submitDetail(): BaseFormSubmitDetail {
        const formData = this._formData();
        return {
            endpoint: this.getAttribute("endpoint")?.trim() || null,
            form:     this._form!,
            data:     this._serialize(formData),
            formData,
            method:   this.getAttribute("method")?.toUpperCase() || "POST",
            redirect: this.getAttribute("redirect")?.trim() || null,
        };
    }

    private _isValid(): boolean {
        let valid = this._form?.reportValidity() ?? true;
        for (const control of this._formControls()) {
            valid = control.reportValidity() && valid;
        }
        return valid;
    }

    private _formData(): FormData {
        const formData = new FormData(this._form!);
        if (Array.from(formData.keys()).length > 0) return formData;

        for (const control of this._formControls()) {
            this._appendControl(formData, control);
        }

        return formData;
    }

    private _populateControlsFromUrl(): void {
        const params = new URLSearchParams(window.location.search);
        if (Array.from(params.keys()).length === 0) return;

        for (const control of this._formControls()) {
            if (!control.name || control.value) continue;
            const value = params.get(control.name);
            if (value !== null) control.value = value;
        }
    }

    private _isSubmitControl(element: Element): boolean {
        if (element instanceof HTMLButtonElement) {
            return (element.type || "submit") === "submit" && !element.disabled;
        }
        if (element instanceof HTMLInputElement) {
            return element.type === "submit" && !element.disabled;
        }
        return false;
    }

    private _formControls(): BaseFormControl[] {
        return Array.from(this.querySelectorAll<BaseFormControl>("input, select, textarea, base-search-input"));
    }

    private _appendControl(
        formData: FormData,
        control: BaseFormControl,
    ): void {
        if (!control.name || control.disabled) return;

        if (control instanceof HTMLInputElement) {
            if ((control.type === "checkbox" || control.type === "radio") && !control.checked) return;
            if (control.type === "file") {
                for (const file of Array.from(control.files ?? [])) {
                    formData.append(control.name, file);
                }
                return;
            }
        }

        if (control instanceof HTMLSelectElement && control.multiple) {
            for (const option of Array.from(control.selectedOptions)) {
                formData.append(control.name, option.value);
            }
            return;
        }

        formData.append(control.name, control.value);
    }

    private _isEnterSubmitTarget(target: EventTarget | null): target is HTMLInputElement | HTMLSelectElement | BaseSearchInputElement {
        if (target instanceof HTMLInputElement) {
            return !target.disabled && target.type !== "button" && target.type !== "submit";
        }
        if (target instanceof HTMLSelectElement) {
            return !target.disabled;
        }
        if (target instanceof HTMLElement && target.localName === "base-search-input") {
            return !target.disabled;
        }
        return false;
    }

    private async _send(detail: BaseFormSubmitDetail): Promise<Response> {
        const method = detail.method.toUpperCase();
        const headers = new Headers({ Accept: "application/json" });
        const init: RequestInit = { method, headers };
        const endpoint = this._requestUrl(detail.endpoint!, method, detail.formData);

        if (method !== "GET" && method !== "HEAD") {
            if (this._hasFile(detail.formData)) {
                init.body = detail.formData;
            } else {
                headers.set("Content-Type", "application/json");
                init.body = JSON.stringify(detail.data);
            }
        }

        return fetch(endpoint, init);
    }

    private _requestUrl(endpoint: string, method: string, formData: FormData): string {
        if (method !== "GET" && method !== "HEAD") return endpoint;

        const url = new URL(endpoint, window.location.href);
        for (const [key, value] of formData.entries()) {
            url.searchParams.append(key, typeof value === "string" ? value : value.name);
        }
        return url.toString();
    }

    private _hasFile(formData: FormData): boolean {
        for (const value of formData.values()) {
            if (value instanceof File && (value.name || value.size > 0)) return true;
        }
        return false;
    }

    private async _readResponseBody(response: Response): Promise<unknown> {
        if (response.status === 204) return null;

        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
            return response.clone().json().catch(() => null);
        }

        return response.clone().text().catch(() => null);
    }

    private _fail(
        detail: BaseFormSubmitDetail,
        response: Response | null,
        body: unknown,
        error: unknown,
    ): void {
        this._setState("error");
        this.dispatchEvent(new CustomEvent<BaseFormErrorDetail>(FORM_ERROR_EVENT, {
            bubbles: true,
            composed: true,
            detail: { ...detail, response, body, error },
        }));
    }

    private _setState(state: "loading" | "loaded" | "error"): void {
        this.setAttribute("state", state);
        this.toggleAttribute("loading", state === "loading");
        this.toggleAttribute("loaded", state === "loaded");
        this.toggleAttribute("error", state === "error");
    }

    private _setControlsDisabled(disabled: boolean): void {
        if (disabled) {
            this.setAttribute("aria-busy", "true");
        } else {
            this.removeAttribute("aria-busy");
        }

        const controls = this.querySelectorAll<
            HTMLButtonElement | BaseFormControl
        >("button, input, select, textarea, base-search-input");

        for (const control of controls) {
            if (disabled) {
                if (control.disabled) continue;
                control.setAttribute("data-base-form-disabled", "");
                control.disabled = true;
            } else if (control.hasAttribute("data-base-form-disabled")) {
                control.removeAttribute("data-base-form-disabled");
                control.disabled = false;
            }
        }
    }

    private _redirectTo(redirect: string): void {
        const url = new URL(redirect, window.location.href);
        if (url.origin !== window.location.origin || (url.protocol !== "http:" && url.protocol !== "https:")) return;

        window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
    }

    private _clearState(): void {
        this.removeAttribute("state");
        this.removeAttribute("loading");
        this.removeAttribute("loaded");
        this.removeAttribute("error");
    }

    private _serialize(formData: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
        const data: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};

        for (const [key, value] of formData.entries()) {
            const current = data[key];

            if (current === undefined) {
                data[key] = value;
            } else if (Array.isArray(current)) {
                current.push(value);
            } else {
                data[key] = [current, value];
            }
        }

        return data;
    }
}

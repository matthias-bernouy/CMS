import {
    SOURCE_BODY_ATTR,
    SOURCE_INHERIT_QUERY_ATTR,
    SOURCE_METHOD_ATTR,
    SOURCE_PUBLISH_ATTR,
    SOURCE_SUCCESS_REDIRECT_ATTR,
    SOURCE_SUCCESS_REDIRECT_PARAM_ATTR,
    SOURCE_SUCCESS_RESET_ATTR,
    SOURCE_SUCCESS_RELOAD_ATTR,
    type SourceMethod,
} from "../core/attrs";
import { interpolateString, type FilterMap } from "../core/interpolate";
import type { Scope } from "../core/scope";
import { resolveSourceBodyFields } from "./presentation/sourceBody";
import { CMS_SOURCE_FAILED_EVENT, CMS_SOURCE_REFRESH_FAILED_EVENT, CMS_SOURCE_SUCCESS_EVENT } from "./submissionEvents";
import {
    collectFormData,
    normalizeFormMethod,
    serializeForm,
    submitForm,
    type FormSubmitResult,
    type SerializedForm,
} from "../submit/formSubmit";

type CapturedSubmission = {
    form: HTMLFormElement;
    method: SourceMethod;
    formData: FormData;
    bodyFields: ReturnType<typeof resolveSourceBodyFields>;
    serialized: SerializedForm;
};

export class SourceSubmission {
    constructor(
        private readonly element: Element,
        private readonly filters: FilterMap,
    ) {}

    capture(url: string): CapturedSubmission | null {
        const form = ownerForm(this.element, this.element.ownerDocument);
        if (!form) {
            return null;
        }
        const method = this.sourceMethod();
        const formData = collectFormData(form);
        const bodyFields =
            method === "GET" || method === "HEAD"
                ? undefined
                : resolveSourceBodyFields(this.element.getAttribute(SOURCE_BODY_ATTR), this.element.ownerDocument);
        return {
            form,
            method,
            formData,
            bodyFields,
            serialized: serializeForm(form, { url: this.submitUrl(url), method, formData, bodyFields }),
        };
    }

    async send(captured: CapturedSubmission, url: string, signal: AbortSignal): Promise<FormSubmitResult> {
        return submitForm(captured.form, {
            url: this.submitUrl(url),
            method: captured.method,
            signal,
            bodyFields: captured.bodyFields,
            formData: captured.formData,
            serialized: captured.serialized,
        });
    }

    complete(result: FormSubmitResult, alias: string | undefined): void {
        if (result.ok && result.refresh?.ok === false) {
            this.element.dispatchEvent(
                new CustomEvent(CMS_SOURCE_REFRESH_FAILED_EVENT, { bubbles: true, composed: true, detail: result }),
            );
            return;
        }
        this.dispatchResult(result);
        if (!result.ok) {
            return;
        }
        this.publish(result);
        if (this.shouldReset()) {
            result.form.reset();
        }
        const target = this.successRedirect(result, alias);
        if (target) {
            this.redirect(target);
        }
    }

    private sourceMethod(): SourceMethod {
        return normalizeFormMethod(this.element.getAttribute(SOURCE_METHOD_ATTR), "POST") as SourceMethod;
    }

    private submitUrl(url: string): string {
        const next = new URL(url, location.href);
        if (this.element.getAttribute(SOURCE_INHERIT_QUERY_ATTR)?.trim().toLowerCase() !== "false") {
            for (const [key, value] of new URLSearchParams(location.search)) {
                next.searchParams.append(key, value);
            }
        }
        return next.toString();
    }

    private dispatchResult(result: FormSubmitResult): void {
        const type = result.ok ? CMS_SOURCE_SUCCESS_EVENT : CMS_SOURCE_FAILED_EVENT;
        const init: CustomEventInit<FormSubmitResult> = { bubbles: true, composed: true, detail: result };
        this.element.dispatchEvent(new CustomEvent(type, init));
    }

    private publish(result: FormSubmitResult): void {
        const events = (this.element.getAttribute(SOURCE_PUBLISH_ATTR) ?? "").split(/\s+/).filter(Boolean);
        for (const eventName of events) {
            this.element.ownerDocument.dispatchEvent(
                new CustomEvent(eventName, { bubbles: true, composed: true, detail: result }),
            );
        }
    }

    private shouldReset(): boolean {
        const value = this.element.getAttribute(SOURCE_SUCCESS_RESET_ATTR)?.trim().toLowerCase();
        if (value === "false" || value === "0" || value === "no") {
            return false;
        }
        if (value === "true" || value === "1" || value === "yes" || value === "") {
            return true;
        }
        if (this.element.hasAttribute(SOURCE_SUCCESS_RELOAD_ATTR)) {
            return false;
        }
        const method = this.sourceMethod();
        return method !== "GET" && method !== "HEAD";
    }

    private successRedirect(result: FormSubmitResult, alias: string | undefined): string {
        const param = this.element.getAttribute(SOURCE_SUCCESS_REDIRECT_PARAM_ATTR)?.trim();
        const requested = param ? new URLSearchParams(location.search).get(param)?.trim() : "";
        if (requested && this.redirectUrl(requested)) {
            return requested;
        }
        const template = this.element.getAttribute(SOURCE_SUCCESS_REDIRECT_ATTR)?.trim();
        if (!template) {
            return "";
        }
        const scope: Scope = {
            value: result,
            vars: {
                ...(alias ? { [alias]: result } : {}),
                result,
                $source: {
                    loading: false,
                    loaded: result.ok,
                    empty: false,
                    error: !result.ok,
                    status: result.status,
                    message: result.message,
                },
            },
        };
        return interpolateString(template, scope, this.filters).trim();
    }

    private redirect(target: string): void {
        const url = this.redirectUrl(target);
        if (url) {
            location.href = `${url.pathname}${url.search}${url.hash}`;
        }
    }

    private redirectUrl(target: string): URL | null {
        let url: URL;
        try {
            url = new URL(target, location.href);
        } catch {
            return null;
        }
        if (url.origin === location.origin && (url.protocol === "http:" || url.protocol === "https:")) {
            return url;
        }
        return null;
    }
}

export function ownerForm(value: EventTarget | null, document: Document): HTMLFormElement | null {
    const ctor = document.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
    return typeof ctor === "function" && value instanceof ctor ? (value as HTMLFormElement) : null;
}

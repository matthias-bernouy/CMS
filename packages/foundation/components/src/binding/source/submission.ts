import {
    SOURCE_BODY_ATTR,
    SOURCE_METHOD_ATTR,
    SOURCE_PUBLISH_ATTR,
    SOURCE_SUCCESS_REDIRECT_ATTR,
    SOURCE_SUCCESS_RESET_ATTR,
    type SourceMethod,
} from "../core/attrs";
import { interpolateString, type FilterMap } from "../core/interpolate";
import type { Scope } from "../core/scope";
import { resolveSourceBodyFields } from "./presentation/sourceBody";
import { CMS_SOURCE_FAILED_EVENT, CMS_SOURCE_SUCCESS_EVENT } from "./submissionEvents";
import { collectFormData, normalizeFormMethod, submitForm, type FormSubmitResult } from "../submit/formSubmit";

type CapturedSubmission = {
    form: HTMLFormElement;
    method: SourceMethod;
    formData: FormData;
    bodyFields: ReturnType<typeof resolveSourceBodyFields>;
};

const LEGACY_FORM_SUCCESS_EVENT = "form:success";
const LEGACY_FORM_FAILED_EVENT = "form:failed";

export class SourceSubmission {
    constructor(
        private readonly element: Element,
        private readonly filters: FilterMap,
    ) {}

    capture(): CapturedSubmission | null {
        const form = ownerForm(this.element, this.element.ownerDocument);
        if (!form) {
            return null;
        }
        const method = this.sourceMethod();
        return {
            form,
            method,
            formData: collectFormData(form),
            bodyFields:
                method === "GET" || method === "HEAD"
                    ? undefined
                    : resolveSourceBodyFields(this.element.getAttribute(SOURCE_BODY_ATTR), this.element.ownerDocument),
        };
    }

    async send(captured: CapturedSubmission, url: string, signal: AbortSignal): Promise<FormSubmitResult> {
        return submitForm(captured.form, {
            url: this.submitUrl(url),
            method: captured.method,
            signal,
            bodyFields: captured.bodyFields,
            formData: captured.formData,
        });
    }

    complete(result: FormSubmitResult, alias: string | undefined): void {
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
        for (const [key, value] of new URLSearchParams(location.search)) {
            next.searchParams.append(key, value);
        }
        return next.toString();
    }

    private dispatchResult(result: FormSubmitResult): void {
        const canonical = result.ok ? CMS_SOURCE_SUCCESS_EVENT : CMS_SOURCE_FAILED_EVENT;
        const legacy = result.ok ? LEGACY_FORM_SUCCESS_EVENT : LEGACY_FORM_FAILED_EVENT;
        const init: CustomEventInit<FormSubmitResult> = { bubbles: true, composed: true, detail: result };
        this.element.dispatchEvent(new CustomEvent(canonical, init));
        this.element.dispatchEvent(new CustomEvent(legacy, init));
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
        const method = this.sourceMethod();
        return method !== "GET" && method !== "HEAD";
    }

    private successRedirect(result: FormSubmitResult, alias: string | undefined): string {
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
        let url: URL;
        try {
            url = new URL(target, location.href);
        } catch {
            return;
        }
        if (url.origin === location.origin && (url.protocol === "http:" || url.protocol === "https:")) {
            location.href = `${url.pathname}${url.search}${url.hash}`;
        }
    }
}

export function ownerForm(value: EventTarget | null, document: Document): HTMLFormElement | null {
    const ctor = document.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
    return typeof ctor === "function" && value instanceof ctor ? (value as HTMLFormElement) : null;
}

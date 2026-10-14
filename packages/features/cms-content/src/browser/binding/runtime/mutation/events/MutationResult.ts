import {
    SOURCE_SUCCESS_REDIRECT_ATTR,
    SOURCE_SUCCESS_REDIRECT_PARAM_ATTR,
    SOURCE_SUCCESS_RELOAD_ATTR,
    SOURCE_SUCCESS_RESET_ATTR,
    type SourceMethod,
} from "../../../core/attrs";
import { interpolateString, type FilterMap } from "../../../core/interpolate";
import type { Scope } from "../../../core/scope";
import type { FormSubmitResult } from "../../../form/formSubmit";
import { CMS_SOURCE_FAILED_EVENT, CMS_SOURCE_REFRESH_FAILED_EVENT, CMS_SOURCE_SUCCESS_EVENT } from "./resultEvents";

export class MutationResult {
    constructor(
        private readonly element: Element,
        private readonly filters: FilterMap,
    ) {}

    complete(result: FormSubmitResult, alias: string | undefined, method: SourceMethod): void {
        if (result.ok && result.refresh?.ok === false) {
            this.element.dispatchEvent(
                new CustomEvent(CMS_SOURCE_REFRESH_FAILED_EVENT, { bubbles: true, composed: true, detail: result }),
            );
            return;
        }
        this.dispatch(result);
        if (!result.ok) {
            return;
        }
        if (this.shouldReset(method)) {
            result.form.reset();
        }
        const target = this.successRedirect(result, alias);
        if (target) {
            this.redirect(target);
        }
    }

    private dispatch(result: FormSubmitResult): void {
        const type = result.ok ? CMS_SOURCE_SUCCESS_EVENT : CMS_SOURCE_FAILED_EVENT;
        const init: CustomEventInit<FormSubmitResult> = { bubbles: true, composed: true, detail: result };
        this.element.dispatchEvent(new CustomEvent(type, init));
    }

    private shouldReset(method: SourceMethod): boolean {
        const value = this.element.getAttribute(SOURCE_SUCCESS_RESET_ATTR)?.trim().toLowerCase();
        if (value === "false" || value === "0" || value === "no") {
            return false;
        }
        if (value === "true" || value === "1" || value === "yes" || value === "") {
            return true;
        }
        return !this.element.hasAttribute(SOURCE_SUCCESS_RELOAD_ATTR) && method !== "GET";
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
        return url.origin === location.origin && (url.protocol === "http:" || url.protocol === "https:") ? url : null;
    }
}

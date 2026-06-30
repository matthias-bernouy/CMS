/** Fetches one `cms-source`, owns reload hooks, and updates its body reactively. */

import { runFetch } from "../fetcher";
import { interpolateString, type FilterMap } from "../interpolate";
import {
    READY_ATTR,
    SOURCE_ATTR,
    SOURCE_METHOD_ATTR,
    SOURCE_PUBLISH_ATTR,
    SOURCE_SUCCESS_REDIRECT_ATTR,
    SOURCE_SUCCESS_RESET_ATTR,
    type SourceMethod,
    type SourceState,
} from "../attrs";
import { captureSourceContent, cloneSourceContent } from "./sourceContent";
import { listenSourceEvents, sourceTrigger } from "./sourceEvents";
import { parseSourceSpec } from "./sourceSpec";
import { resolveReactiveUrl } from "./reactiveUrl";
import { SourceRenderer } from "./sourceRenderer";
import { SourcePresenter } from "./sourcePresenter";
import { type SourceStatusOptions } from "./sourceStatus";
import { normalizeFormMethod, submitForm, type FormSubmitResult } from "../submit/formSubmit";
import { type Scope } from "../scope";

export { clearRuntimeStamps } from "./runtimeStamps";
export { RELOAD_ATTR, RELOAD_EVENT } from "./sourceEvents";
export type { SourceStatusValue } from "./sourceStatus";

type SourceOptions = SourceStatusOptions & {
    sourceStateForce?: SourceState;
    afterSourceRender?: (source: Element) => void;
};

export class Source {
    private readonly renderer: SourceRenderer;
    private readonly presenter: SourcePresenter;
    private abort: AbortController | null = null;
    private stopListeners: (() => void) | null = null;
    private lastUrl: string | null = null;
    private readonly formOwned: boolean;

    private readonly onReload = () => { if (this.el.isConnected) void this.run(); };
    private readonly onReactiveUrlChange = () => { if (this.el.isConnected) void this.run({ onlyIfUrlChanged: true }); };
    private readonly onSubmit = (event: SubmitEvent) => {
        const form = asOwnerForm(event.currentTarget, this.el.ownerDocument)
            ?? this.el.closest("form");
        const valid = typeof form?.reportValidity === "function" ? form.reportValidity() : true;
        if (!valid) {
            event.preventDefault();
            return;
        }
        event.preventDefault();
        if (this.el.isConnected) void this.run();
    };

    constructor(
        private readonly el: Element,
        private readonly filters: FilterMap = {},
        private readonly options: SourceOptions = {},
    ) {
        this.formOwned = asOwnerForm(el, el.ownerDocument) !== null && sourceTrigger(el) === "submit";
        const captured = this.formOwned ? cloneSourceContent(el) : captureSourceContent(el);
        this.renderer = new SourceRenderer(el, captured, this.filters, { inPlace: this.formOwned });
        this.presenter = new SourcePresenter(el, captured, this.renderer, this.options);
    }

    start(): void {
        this.stopListeners = listenSourceEvents(this.el, {
            onReload: this.onReload,
            onReactiveUrlChange: this.onReactiveUrlChange,
            onSubmit: this.onSubmit,
        });
        if (sourceTrigger(this.el) === "auto" || this.options.sourceStateForce) void this.run();
        else {
            const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
            if (spec.url) {
                this.presenter.initial(spec.alias);
                this.afterRender();
            }
        }
        this.el.setAttribute(READY_ATTR, "");
    }

    dispose(): void {
        this.abort?.abort();
        this.abort = null;
        this.stopListeners?.();
        this.stopListeners = null;
    }

    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        this.renderer.template();
    }

    async run(opts?: { onlyIfUrlChanged?: boolean }): Promise<void> {
        if (this.options.sourceStateForce && this.options.sourceStateForce !== "loaded") {
            this.abort?.abort();
            this.abort = null;
            this.presenter.forced(this.options.sourceStateForce);
            return;
        }

        const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
        if (!spec.url) return;
        const url = resolveReactiveUrl(spec.url, this.el.ownerDocument);
        if (opts?.onlyIfUrlChanged && url === this.lastUrl) return;
        this.lastUrl = url;

        this.presenter.loading(spec.alias);
        this.afterRender();
        this.abort?.abort();
        const ac = new AbortController();
        this.abort = ac;

        if (this.formOwned) {
            const form = asOwnerForm(this.el, this.el.ownerDocument);
            if (!form) return;
            const result = await submitForm(form, {
                url: this.submitUrl(url),
                method: this.sourceMethod(),
                signal: ac.signal,
            });
            if (ac.signal.aborted) return;
            this.presenter.result(spec.alias, result);
            this.afterRender();
            this.afterSubmit(result, spec.alias);
            return;
        }

        const outcome = await runFetch(url, ac.signal);
        if (ac.signal.aborted || outcome.kind === "aborted") return;
        if (outcome.kind === "error") {
            this.presenter.error(spec.alias, url, outcome.status, outcome.message);
            this.afterRender();
            return;
        }

        this.presenter.data(spec.alias, outcome.data);
        this.afterRender();
    }

    private sourceMethod(): SourceMethod {
        const fallback = this.formOwned ? "POST" : "GET";
        return normalizeFormMethod(this.el.getAttribute(SOURCE_METHOD_ATTR), fallback) as SourceMethod;
    }

    private submitUrl(url: string): string {
        const next = new URL(url, location.href);
        for (const [key, value] of new URLSearchParams(location.search)) next.searchParams.append(key, value);
        return next.toString();
    }

    private afterSubmit(result: FormSubmitResult, alias: string | undefined): void {
        if (!result.ok) return;
        this.publish(result);
        if (this.shouldReset()) result.form.reset();
        const redirect = this.successRedirect(result, alias);
        if (redirect) this.redirect(redirect);
    }

    private publish(result: FormSubmitResult): void {
        const events = (this.el.getAttribute(SOURCE_PUBLISH_ATTR) ?? "").split(/\s+/).filter(Boolean);
        for (const eventName of events) {
            this.el.ownerDocument.dispatchEvent(new CustomEvent(eventName, {
                bubbles: true,
                composed: true,
                detail: result,
            }));
        }
    }

    private shouldReset(): boolean {
        const value = this.el.getAttribute(SOURCE_SUCCESS_RESET_ATTR)?.trim().toLowerCase();
        if (value === "false" || value === "0" || value === "no") return false;
        if (value === "true" || value === "1" || value === "yes" || value === "") return true;
        const method = this.sourceMethod();
        return method !== "GET" && method !== "HEAD";
    }

    private successRedirect(result: FormSubmitResult, alias: string | undefined): string {
        const template = this.el.getAttribute(SOURCE_SUCCESS_REDIRECT_ATTR)?.trim();
        if (!template) return "";
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
        try { url = new URL(target, location.href); }
        catch { return; }
        if (url.origin !== location.origin || (url.protocol !== "http:" && url.protocol !== "https:")) return;
        location.href = `${url.pathname}${url.search}${url.hash}`;
    }

    private afterRender(): void {
        this.options.afterSourceRender?.(this.el);
    }
}

function asOwnerForm(value: EventTarget | null, doc: Document): HTMLFormElement | null {
    const ctor = doc.defaultView?.HTMLFormElement ?? globalThis.HTMLFormElement;
    return typeof ctor === "function" && value instanceof ctor ? value as HTMLFormElement : null;
}

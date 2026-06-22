/** Fetches one `cms-source`, renders its authored template, and owns reload hooks. */

import { runFetch } from "../fetcher";
import { captureContent, renderContent, isEmpty, type Captured } from "../render/slots";
import { type FilterMap } from "../interpolate";
import { resolveParams, hasParamTokens, PARAMS_CHANGE_EVENT } from "../params";
import { READY_ATTR, SOURCE_ATTR, type SourceState } from "../attrs";
import { renderForcedSourceState } from "./forcedState";
import { parseSourceSpec, sourceUrl } from "./sourceSpec";
export { clearRuntimeStamps } from "./runtimeStamps";

/** Space-separated event names in this attribute re-run the source. */
export const RELOAD_ATTR = "cms-reload-on";
/** Always-listened global event — `document.dispatchEvent(new Event(...))`
 *  reloads every live source. */
export const RELOAD_EVENT = "cms-source:reload";

export class Source {
    private readonly captured: Captured;
    private abort: AbortController | null = null;
    private reloadEvents: string[] = [];
    private paramReactive = false;
    private lastUrl: string | null = null;
    private readonly onReload = () => { if (this.el.isConnected) void this.run(); };
    /** Param-reactive reloads are global, so only re-run when this URL changed. */
    private readonly onParamsChange = () => { if (this.el.isConnected) void this.run({ onlyIfUrlChanged: true }); };

    constructor(
        private readonly el: Element,
        private readonly filters: FilterMap = {},
        private readonly options: { sourceStateForce?: SourceState } = {},
    ) {
        this.captured = captureContent(el);
    }

    /** Wire reload listeners and kick off the first fetch. The synchronous part
     *  of `run()` has already shown the loading slot (if any) by the time we
     *  mark the element ready, so revealing it never exposes the raw template. */
    start(): void {
        this.listen();
        void this.run();
        this.el.setAttribute(READY_ATTR, "");
    }

    /** Abort any in-flight request and drop reload listeners. Called by the
     *  runtime when this source's element leaves the DOM. */
    dispose(): void {
        this.abort?.abort();
        this.abort = null;
        this.unlisten();
    }

    /** Editor support: replace the live render with the authored template (raw,
     *  un-interpolated — `{{ }}` literal, `cms-repeat` intact), aborting any
     *  in-flight fetch. The core reveals freshly-cloned nested sources. */
    renderTemplate(): void {
        this.abort?.abort();
        this.abort = null;
        renderContent(this.el, this.captured.template, null, this.filters);
    }

    private listen(): void {
        const doc = this.el.ownerDocument;
        const named = (this.el.getAttribute(RELOAD_ATTR) ?? "").split(/\s+/).filter(Boolean);
        this.reloadEvents = [RELOAD_EVENT, ...named];
        for (const ev of this.reloadEvents) doc.addEventListener(ev, this.onReload);

        // A `#{param}`-dependent source reloads when the query params change —
        // via setParam (PARAMS_CHANGE_EVENT) or the browser back/forward (popstate).
        if (hasParamTokens(sourceUrl(this.el.getAttribute(SOURCE_ATTR) ?? ""))) {
            this.paramReactive = true;
            doc.addEventListener(PARAMS_CHANGE_EVENT, this.onParamsChange);
            doc.defaultView?.addEventListener?.("popstate", this.onParamsChange);
        }
    }

    private unlisten(): void {
        const doc = this.el.ownerDocument;
        for (const ev of this.reloadEvents) doc.removeEventListener(ev, this.onReload);
        this.reloadEvents = [];
        if (this.paramReactive) {
            doc.removeEventListener(PARAMS_CHANGE_EVENT, this.onParamsChange);
            doc.defaultView?.removeEventListener?.("popstate", this.onParamsChange);
            this.paramReactive = false;
        }
    }

    async run(opts?: { onlyIfUrlChanged?: boolean }): Promise<void> {
        if (this.options.sourceStateForce && this.options.sourceStateForce !== "loaded") {
            this.renderForcedState(this.options.sourceStateForce);
            return;
        }

        const spec = parseSourceSpec(this.el.getAttribute(SOURCE_ATTR) ?? "");
        if (!spec.url) return;
        // Resolve `#{param}` against the current query string just before fetch.
        const url = resolveParams(spec.url);
        // Param-reactive trigger whose resolved URL didn't change → skip: the
        // cms-params:change event is global, so an unrelated param must not
        // re-fetch + re-render this source (set synchronously so back-to-back
        // changes compare against the in-flight URL).
        if (opts?.onlyIfUrlChanged && url === this.lastUrl) return;
        this.lastUrl = url;

        const { slots, body } = this.captured;
        if (slots.loading) renderContent(this.el, slots.loading, null, this.filters);

        this.abort?.abort();
        const ac = new AbortController();
        this.abort = ac;

        const outcome = await runFetch(url, ac.signal);
        if (ac.signal.aborted) return; // superseded by a newer run, or torn down

        if (outcome.kind === "aborted") return;

        if (outcome.kind === "error") {
            if (slots.error) {
                const ctx = { value: { status: outcome.status, message: outcome.message } };
                renderContent(this.el, slots.error, ctx, this.filters);
            } else {
                this.el.replaceChildren();
                console.warn(`cms-source "${url}": ${outcome.message}`);
            }
            return;
        }

        const data = outcome.data;
        const scope = spec.alias
            ? { value: data, vars: { [spec.alias]: data } }
            : { value: data };

        if (isEmpty(data) && slots.empty) {
            renderContent(this.el, slots.empty, scope, this.filters);
        } else {
            renderContent(this.el, body, scope, this.filters);
        }
    }

    private renderForcedState(state: Exclude<SourceState, "loaded">): void {
        this.abort?.abort();
        this.abort = null;
        renderForcedSourceState(this.el, this.captured, this.filters, state);
    }
}
